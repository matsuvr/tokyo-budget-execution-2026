import {
  carryoverRate,
  executionRate,
  unusedRate,
} from "../metrics.ts";
import { checkExclusion } from "../exclusions.ts";
import type { ExclusionReasonCode } from "../exclusions.ts";
import type { ExecutionRecord } from "../types.ts";

/**
 * 2024年度一般会計の執行スキャンを構築する純粋関数（Issue #21）。
 * - 各明細行に執行率・繰越率・不用率と政策レビュー対象外フラグを付与する。
 * - 率は生の比率（0〜1超え得る）。分母0や欠損は null（0で補完しない）。
 * - ランキングは対象外行を除き、同順位は安定キー昇順で決定的に並べる。
 */

/** 1億円（率ランキングの分母下限） */
export const RATE_RANKING_MIN_BUDGET_YEN = 100_000_000;
/** 各ランキングの最大件数 */
export const RANKING_LIMIT = 10;

export interface ScanRecord extends ExecutionRecord {
  rates: {
    /** 支出済額 / 予算現額 */
    executionRate: number | null;
    /** 翌年度繰越額 / 予算現額 */
    carryoverRate: number | null;
    /** 不用額 / 予算現額 */
    unusedRate: number | null;
  };
  policyReview: {
    excluded: boolean;
    reasonCode: ExclusionReasonCode;
    matchedKeyword: string | null;
  };
}

/** accountKeyの各要素（例: "02:総務費"）から名称部分を取り出す。 */
function levelName(level: string): string {
  const index = level.indexOf(":");
  return index >= 0 ? level.slice(index + 1) : level;
}

export function buildScanRecord(record: ExecutionRecord): ScanRecord {
  const exclusion = checkExclusion({
    account: levelName(record.accountKey.account),
    chapter: levelName(record.accountKey.chapter),
    section: levelName(record.accountKey.section),
    item: levelName(record.accountKey.item),
  });
  return {
    ...record,
    rates: {
      executionRate: executionRate(record.spentYen, record.currentBudgetYen),
      carryoverRate: carryoverRate(record.carryoverYen, record.currentBudgetYen),
      unusedRate: unusedRate(record.unusedYen, record.currentBudgetYen),
    },
    policyReview: {
      excluded: exclusion.excluded,
      reasonCode: exclusion.reasonCode,
      matchedKeyword: exclusion.matchedKeyword,
    },
  };
}

export interface RankingEntry {
  key: string;
  chapter: string;
  section: string;
  item: string;
  valueYen: number;
  rate: number | null;
}

export type RankingField = "unusedAmount" | "unusedRate" | "carryoverAmount" | "carryoverRate";

export interface RankingOptions {
  field: RankingField;
  limit?: number;
  /** 分母（予算現額）の下限。率ランキングで1億円などを指定する。 */
  minBudgetYen?: number;
}

/**
 * 決定的なランキングを生成する。
 * - 対象外行は除く（出力本体には残る）。
 * - 降順。同値は安定キー昇順。
 */
export function rankScanRecords(
  records: readonly ScanRecord[],
  options: RankingOptions,
): RankingEntry[] {
  const limit = options.limit ?? RANKING_LIMIT;
  const entries: (RankingEntry & { sortValue: number })[] = [];
  for (const record of records) {
    if (record.policyReview.excluded) continue;
    if (options.minBudgetYen != null && record.currentBudgetYen < options.minBudgetYen) continue;
    let valueYen: number;
    let rate: number | null;
    switch (options.field) {
      case "unusedAmount":
        valueYen = record.unusedYen;
        rate = record.rates.unusedRate;
        break;
      case "unusedRate":
        valueYen = record.unusedYen;
        rate = record.rates.unusedRate;
        break;
      case "carryoverAmount":
        valueYen = record.carryoverYen;
        rate = record.rates.carryoverRate;
        break;
      case "carryoverRate":
        valueYen = record.carryoverYen;
        rate = record.rates.carryoverRate;
        break;
    }
    const sortValue =
      options.field === "unusedRate" || options.field === "carryoverRate" ? (rate ?? Number.NaN) : valueYen;
    if (Number.isNaN(sortValue)) continue; // 率が計算不能な行はランキング対象外
    entries.push({
      key: record.accountKey.key,
      chapter: record.accountKey.chapter,
      section: record.accountKey.section,
      item: record.accountKey.item,
      valueYen,
      rate,
      sortValue,
    });
  }
  entries.sort((a, b) => b.sortValue - a.sortValue || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return entries.slice(0, limit).map(({ sortValue: _sortValue, ...entry }) => entry);
}
