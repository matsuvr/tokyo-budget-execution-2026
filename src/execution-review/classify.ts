/**
 * 執行レビューの状態分類を単一の純粋関数へ集約する。
 * - 閾値は外から渡せる定数オブジェクトにする（デフォルトは初期スクリーニング条件）。
 * - 入力は変更しない。
 * - 優先順位はコードとテストから明確にする。
 */

import type { MappingConfidence, ReviewStatus } from "./types.ts";

/**
 * 分類に必要な入力。欠損は null で表現する。
 */
export interface ClassifyInput {
  /** 執行率 0〜1 または null */
  executionRate: number | null;
  /** 繰越率 0〜1 または null */
  carryoverRate: number | null;
  /** 不用率 0〜1 または null */
  unusedRate: number | null;
  /** 予算継続率 0〜1 または null */
  budgetContinuationRate: number | null;
  /** 2024年度予算現額（円） */
  currentBudgetYen: number | null;
  /** 対応信頼度 */
  mappingConfidence: MappingConfidence;
  /** 廃止・統合が公式に明示されているか */
  isDiscontinuedOrMerged?: boolean;
}

/**
 * 分類閾値。初期値は MVP のスクリーニング条件に準拠する。
 */
export interface ClassifyThresholds {
  /** 要説明の不用率閾値（0.2 = 20%） */
  needsUnusedRate: number;
  /** 要説明の最低予算現額（100_000_000 = 1億円） */
  needsMinCurrentBudgetYen: number;
  /** 要説明の予算継続率閾値（0.9 = 90%） */
  needsBudgetContinuationRate: number;
  /** 繰越と判定する繰越率閾値（0.2） */
  carryoverRate: number;
  /** 執行済みと判定する執行率閾値（0.9） */
  executedRate: number;
  /** 見直し反映と判定する予算継続率上限（0.5 = 50%未満） */
  reviewReflectedBudgetContinuationRate: number;
}

/** MVP初期値 */
export const DEFAULT_THRESHOLDS: ClassifyThresholds = {
  needsUnusedRate: 0.2,
  needsBudgetContinuationRate: 0.9,
  needsMinCurrentBudgetYen: 100_000_000,
  carryoverRate: 0.2,
  executedRate: 0.9,
  reviewReflectedBudgetContinuationRate: 0.5,
};

/**
 * 入力済み指標から ReviewStatus を返す純粋関数。
 *
 * 優先順位:
 * 1. 対応信頼度が C / unmatched → incomparable（比較不能を最優先）
 * 2. 低執行かつ廃止・統合明示 → review-reflected（要説明より優先）
 * 3. 不用率>=20% かつ 予算現額>=1億円 かつ 予算継続率>=90% → needs-explanation
 * 4. 繰越率>=20% かつ 不用率<20% → carryover（繰越と不用が同時に大きい場合は needs-explanation が優先）
 * 5. 低執行（不用率>=20%）で予算継続率<50% → review-reflected
 * 6. 執行率>=90% → executed
 * 7. それ以外 → incomparable（無理に needs-explanation にしない）
 */
export function classifyReviewStatus(
  input: ClassifyInput,
  thresholds: ClassifyThresholds = DEFAULT_THRESHOLDS,
): ReviewStatus {
  // 入力を変更しない（防御的コピー不要だが、参照を保持しない）
  const {
    executionRate,
    carryoverRate,
    unusedRate,
    budgetContinuationRate,
    currentBudgetYen,
    mappingConfidence,
    isDiscontinuedOrMerged,
  } = input;

  // 1. 対応不能は最優先で incomparable
  if (mappingConfidence === "C" || mappingConfidence === "unmatched") {
    return "incomparable";
  }

  const isLowExecution = unusedRate != null && unusedRate >= thresholds.needsUnusedRate;

  // 2. 見直し反映（廃止・統合明示）は要説明より優先する
  if (isLowExecution && isDiscontinuedOrMerged === true) {
    return "review-reflected";
  }

  // 3. 要説明候補
  if (
    unusedRate != null &&
    budgetContinuationRate != null &&
    currentBudgetYen != null &&
    unusedRate >= thresholds.needsUnusedRate &&
    currentBudgetYen >= thresholds.needsMinCurrentBudgetYen &&
    budgetContinuationRate >= thresholds.needsBudgetContinuationRate
  ) {
    return "needs-explanation";
  }

  // 4. 遅延・繰越（不用率が閾値未満のときのみ）
  if (
    carryoverRate != null &&
    carryoverRate >= thresholds.carryoverRate &&
    (unusedRate == null || unusedRate < thresholds.needsUnusedRate)
  ) {
    return "carryover";
  }

  // 5. 見直し反映：低執行かつ予算継続率<50%
  if (
    isLowExecution &&
    budgetContinuationRate != null &&
    budgetContinuationRate < thresholds.reviewReflectedBudgetContinuationRate
  ) {
    return "review-reflected";
  }

  // 5. 執行済み
  if (executionRate != null && executionRate >= thresholds.executedRate) {
    return "executed";
  }

  // 6. それ以外は比較不能／未分類
  return "incomparable";
}
