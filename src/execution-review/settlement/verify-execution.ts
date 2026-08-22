import type { ExecutionRecord } from "../types.ts";

/**
 * 執行実績の会計恒等式検証の純粋関数（Issue #20）。
 *
 * 検証式: 予算現額 = 支出済額 + 翌年度繰越額 + 不用額 （許容差は引数で指定、既定0円）
 * - 現額を算術復元したレコード（derived）は恒等式が自明なため検証対象外として別件数にする。
 * - 欠損（null）がある行は不一致と混同せず notVerifiable として別件数にする。
 */

export interface IdentityMismatch {
  /** 安定キー */
  key: string;
  /** 出典ページ（不明ならnull） */
  pageNumber: number | null;
  /** 差額（現額 − 支出済 − 繰越 − 不用） */
  differenceYen: number;
}

export interface IdentityCheckResult {
  checked: number;
  passed: number;
  mismatched: IdentityMismatch[];
  /** 欠損などで検証できない行の件数 */
  notVerifiable: number;
  /** 現額を復元したため検証が自明な行の件数 */
  derivedSkipped: number;
}

export function verifyBudgetIdentity(
  records: readonly ExecutionRecord[],
  options: { toleranceYen?: number } = {},
): IdentityCheckResult {
  const tolerance = options.toleranceYen ?? 0;
  let checked = 0;
  let passed = 0;
  let notVerifiable = 0;
  let derivedSkipped = 0;
  const mismatched: IdentityMismatch[] = [];

  for (const record of records) {
    const extended = record as ExecutionRecord & { derived?: string[] };
    if (extended.derived?.includes("currentBudgetYen")) {
      derivedSkipped += 1;
      continue;
    }
    if (
      record.currentBudgetYen == null ||
      record.spentYen == null ||
      record.carryoverYen == null ||
      record.unusedYen == null
    ) {
      notVerifiable += 1;
      continue;
    }
    checked += 1;
    const difference =
      record.currentBudgetYen - (record.spentYen + record.carryoverYen + record.unusedYen);
    if (Math.abs(difference) <= tolerance) {
      passed += 1;
    } else {
      mismatched.push({
        key: record.accountKey.key,
        pageNumber: record.sourcePage,
        differenceYen: difference,
      });
    }
  }
  return { checked, passed, mismatched, notVerifiable, derivedSkipped };
}

/** 公式総額との照合対象1件。 */
export interface OfficialTotalFixture {
  /** 集計名（例: 一般会計 歳出予算現額） */
  name: string;
  /** 公式資料の値（円） */
  officialYen: number;
  /** 集計対象フィールド */
  field: "currentBudgetYen" | "spentYen" | "carryoverYen" | "unusedYen";
  /** 集計対象階層: 款のみを合計する */
  level: "chapter";
  /** 原本が千円単位のための許容差（円）。既定0。 */
  toleranceYen?: number;
  /** 出典 */
  sourceTitle: string;
  sourcePage: number | null;
}

export interface OfficialTotalComparison {
  name: string;
  officialYen: number;
  actualSumYen: number;
  differenceYen: number;
  pass: boolean;
  sourceTitle: string;
  sourcePage: number | null;
}

export function verifyOfficialTotals(
  records: readonly ExecutionRecord[],
  fixtures: readonly OfficialTotalFixture[],
): OfficialTotalComparison[] {
  return fixtures.map((fixture) => {
    let actualSum = 0n;
    for (const record of records) {
      if (fixture.level === "chapter" && record.accountKey.section !== "") continue;
      const value: number | null = record[fixture.field];
      if (value != null) actualSum += BigInt(value);
    }
    const difference = Number(actualSum - BigInt(fixture.officialYen));
    return {
      name: fixture.name,
      officialYen: fixture.officialYen,
      actualSumYen: Number(actualSum),
      differenceYen: difference,
      pass: Math.abs(difference) <= (fixture.toleranceYen ?? 0),
      sourceTitle: fixture.sourceTitle,
      sourcePage: fixture.sourcePage,
    };
  });
}
