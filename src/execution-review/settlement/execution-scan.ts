import { buildAttentionFlags, classifyGapComposition } from "../attention-flags.ts";
import { checkExclusion, type ExclusionReasonCode } from "../exclusions.ts";
import {
  carryoverRate,
  executionRate,
  unusedRate,
  yearEndUnexecutedRate,
  yearEndUnexecutedYen,
} from "../metrics.ts";
import { classifyReviewScope, type ReviewScopeReasonCode } from "../review-scope.ts";
import type { ReviewScope } from "../review-scope.ts";
import type { AttentionFlag, ExecutionRecord, GapComposition } from "../types.ts";

export const RATE_RANKING_MIN_BUDGET_YEN = 100_000_000;
export const RANKING_LIMIT = 10;

export interface ScanRecord extends ExecutionRecord {
  rates: {
    executionRate: number | null;
    carryoverRate: number | null;
    unusedRate: number | null;
  };
  policyReview: {
    excluded: boolean;
    reasonCode: ExclusionReasonCode;
    matchedKeyword: string | null;
  };
  yearEndUnexecuted: {
    amountYen: number;
    rate: number | null;
    composition: GapComposition;
  };
  reviewScope: {
    scope: ReviewScope;
    reasonCode: ReviewScopeReasonCode;
    matchedKeyword: string | null;
  };
  /** 2024決算だけで判断できるフラグ。年度間比較フラグは後段で追加する。 */
  attentionFlags: AttentionFlag[];
  rowKind?: string;
  sourceRowIndex?: number;
}

function levelName(level: string): string {
  const index = level.indexOf(":");
  return index >= 0 ? level.slice(index + 1) : level;
}

/** 主一覧・主集計は最下位の公式決算階層（目）だけを使い、階層重複を避ける。 */
export function isLeafExecutionRecord(
  record: Pick<ExecutionRecord, "accountKey"> & { rowKind?: string },
): boolean {
  return record.accountKey.item.trim().length > 0 && record.rowKind !== "subtotal";
}

export function buildScanRecord(record: ExecutionRecord): ScanRecord {
  const exclusion = checkExclusion({
    account: levelName(record.accountKey.account),
    chapter: levelName(record.accountKey.chapter),
    section: levelName(record.accountKey.section),
    item: levelName(record.accountKey.item),
  });
  const amountYen = yearEndUnexecutedYen(record.carryoverYen, record.unusedYen);
  if (amountYen == null) throw new Error(`missing year-end amount: ${record.accountKey.key}`);
  const rate = yearEndUnexecutedRate(record.carryoverYen, record.unusedYen, record.currentBudgetYen);
  const scope = classifyReviewScope({
    accountKey: record.accountKey,
    executionMethod: record.executionMethod,
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
    yearEndUnexecuted: {
      amountYen,
      rate,
      composition: classifyGapComposition(record.carryoverYen, record.unusedYen),
    },
    reviewScope: scope,
    attentionFlags: buildAttentionFlags({
      yearEndUnexecutedYen: amountYen,
      yearEndUnexecutedRate: rate,
      comparison: null,
      includeComparisonSignals: false,
    }),
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

export type RankingField =
  | "unusedAmount"
  | "unusedRate"
  | "carryoverAmount"
  | "carryoverRate"
  | "yearEndUnexecutedAmount"
  | "yearEndUnexecutedRate";

export interface RankingOptions {
  field: RankingField;
  limit?: number;
  minBudgetYen?: number;
}

export function rankScanRecords(
  records: readonly ScanRecord[],
  options: RankingOptions,
): RankingEntry[] {
  const limit = options.limit ?? RANKING_LIMIT;
  const entries: (RankingEntry & { sortValue: number })[] = [];
  const isNewField = options.field === "yearEndUnexecutedAmount" || options.field === "yearEndUnexecutedRate";

  for (const record of records) {
    if (isNewField) {
      if (record.reviewScope.scope !== "operational") continue;
    } else if (record.policyReview.excluded) {
      continue;
    }
    if (options.minBudgetYen != null && record.currentBudgetYen < options.minBudgetYen) continue;

    let valueYen: number;
    let rate: number | null;
    switch (options.field) {
      case "unusedAmount":
      case "unusedRate":
        valueYen = record.unusedYen;
        rate = record.rates.unusedRate;
        break;
      case "carryoverAmount":
      case "carryoverRate":
        valueYen = record.carryoverYen;
        rate = record.rates.carryoverRate;
        break;
      case "yearEndUnexecutedAmount":
      case "yearEndUnexecutedRate":
        valueYen = record.yearEndUnexecuted.amountYen;
        rate = record.yearEndUnexecuted.rate;
        break;
    }
    const sortValue = options.field.endsWith("Rate") ? (rate ?? Number.NaN) : valueYen;
    if (Number.isNaN(sortValue)) continue;
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
