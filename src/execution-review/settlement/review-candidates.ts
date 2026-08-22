import {
  classifyReviewStatus,
  DEFAULT_THRESHOLDS,
  type ClassifyThresholds,
} from "../classify.ts";
import type { ReviewStatus } from "../types.ts";

/**
 * 比較レコードへ状態分類を付け、確認対象一覧を構築する純粋関数（Issue #30）。
 * - 分類は #6 の classifyReviewStatus（固定ルール）のみで行う。
 * - 状態名から原因を推測する文言は生成しない。statusReasons は閾値条件の成立事実のみ。
 * - 出力順序: needs-explanation を先頭に不用額降順、以降は status→安定キー昇順。
 */

export interface ComparisonInput {
  comparisonId?: string;
  mappingId: string;
  confidence: "A" | "B";
  relationType: string;
  granularity: string;
  fy2024Keys: readonly { chapter: string; section?: string }[];
  amounts: {
    fy2024CurrentBudgetYen: number | null;
    fy2024SpentYen: number | null;
    fy2024CarryoverYen: number | null;
    fy2024UnusedYen: number | null;
    fy2026InitialBudgetYen: number | null;
  };
  rates: {
    executionRate: number | null;
    carryoverRate: number | null;
    unusedRate: number | null;
    budgetContinuationRate: number | null;
  };
}

export interface ReviewCandidateRow extends ComparisonInput {
  status: ReviewStatus;
  statusReasons: string[];
  thresholdsUsed: ClassifyThresholds;
  policyReviewExcluded: boolean;
  exclusionReasonCode: string | null;
}

/** 対象外判定に使う最小限の情報（Issue #7のルール呼び出しは呼び出し側で行う） */
export interface ReviewCandidateBuildOptions {
  thresholds?: ClassifyThresholds;
  /** 科目正規化名 → 対象外判定済みフラグ/理由の索引 */
  exclusionLookup: (chapterName: string, sectionName: string | null) => {
    excluded: boolean;
    reasonCode: string | null;
  };
}

function stripCode(value: string): string {
  const index = value.indexOf(":");
  const name = index >= 0 ? value.slice(index + 1) : value;
  return name.replace(/\s+/gu, "");
}

export function buildReviewCandidates(
  comparisons: readonly ComparisonInput[],
  options: ReviewCandidateBuildOptions,
): ReviewCandidateRow[] {
  const thresholds = options.thresholds ?? DEFAULT_THRESHOLDS;
  const rows: (ReviewCandidateRow & { sortGroup: number })[] = [];

  for (const comparison of comparisons) {
    const firstKey = comparison.fy2024Keys[0];
    const chapterName = stripCode(firstKey.chapter);
    const sectionName =
      firstKey.section != null && firstKey.section !== "" ? stripCode(firstKey.section) : null;
    const exclusion = options.exclusionLookup(chapterName, sectionName);

    const input = {
      executionRate: comparison.rates.executionRate,
      carryoverRate: comparison.rates.carryoverRate,
      unusedRate: comparison.rates.unusedRate,
      budgetContinuationRate: comparison.rates.budgetContinuationRate,
      currentBudgetYen: comparison.amounts.fy2024CurrentBudgetYen,
      mappingConfidence: comparison.confidence,
      isDiscontinuedOrMerged:
        comparison.relationType === "merged" || comparison.relationType === "discontinued",
    };
    const status = classifyReviewStatus(input, thresholds);

    // 成立した閾値条件を列挙する（原因推測の文言は生成しない）
    const statusReasons: string[] = [];
    if (
      comparison.rates.unusedRate != null &&
      comparison.rates.unusedRate >= thresholds.needsUnusedRate
    ) {
      statusReasons.push(`unusedRate>=${thresholds.needsUnusedRate}`);
    }
    if (
      comparison.amounts.fy2024CurrentBudgetYen != null &&
      comparison.amounts.fy2024CurrentBudgetYen >= thresholds.needsMinCurrentBudgetYen
    ) {
      statusReasons.push(
        `currentBudgetYen>=${thresholds.needsMinCurrentBudgetYen}`,
      );
    }
    if (
      comparison.rates.budgetContinuationRate != null &&
      comparison.rates.budgetContinuationRate >= thresholds.needsBudgetContinuationRate
    ) {
      statusReasons.push(`budgetContinuationRate>=${thresholds.needsBudgetContinuationRate}`);
    }
    if (
      comparison.rates.carryoverRate != null &&
      comparison.rates.carryoverRate >= thresholds.carryoverRate
    ) {
      statusReasons.push(`carryoverRate>=${thresholds.carryoverRate}`);
    }
    if (
      comparison.rates.executionRate != null &&
      comparison.rates.executionRate >= thresholds.executedRate
    ) {
      statusReasons.push(`executionRate>=${thresholds.executedRate}`);
    }
    if (comparison.relationType === "merged" || comparison.relationType === "discontinued") {
      statusReasons.push("relationType-discontinued-or-merged");
    }

    const sortGroup = status === "needs-explanation" ? 0 : 1;
    rows.push({
      ...comparison,
      status,
      statusReasons,
      thresholdsUsed: thresholds,
      policyReviewExcluded: exclusion.excluded,
      exclusionReasonCode: exclusion.reasonCode,
      sortGroup,
    });
  }

  return rows.sort((a, b) => {
    if (a.sortGroup !== b.sortGroup) return a.sortGroup - b.sortGroup;
    // needs-explanation 内は不用額の大きい順
    const unusedA = a.amounts.fy2024UnusedYen ?? -1;
    const unusedB = b.amounts.fy2024UnusedYen ?? -1;
    if (a.status === "needs-explanation" && b.status === "needs-explanation") {
      if (unusedA !== unusedB) return unusedB - unusedA;
    }
    if (a.status !== b.status) {
      const order: Record<string, number> = {
        carryover: 0,
        "review-reflected": 1,
        executed: 2,
        incomparable: 3,
        "needs-explanation": 0,
      };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    }
    return a.mappingId < b.mappingId ? -1 : a.mappingId > b.mappingId ? 1 : 0;
  }).map(({ sortGroup: _sortGroup, ...row }) => row);
}
