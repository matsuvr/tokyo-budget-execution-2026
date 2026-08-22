/**
 * 執行レビューで使う基本指標の純粋関数。
 * - 丸めは行わず生の比率を返す。表示時のみ整形する。
 * - 分母が 0 または null/undefined なら null を返す（0で補完しない）。
 * - 負数は RangeError を投げる（呼び出し側で捕捉して not-found 等へ）。
 * - 入力オブジェクトは変更しない。
 */

/**
 * 執行率 = 支出済額 / 予算現額
 */
export function executionRate(
  spentYen: number | null | undefined,
  currentBudgetYen: number | null | undefined,
): number | null {
  if (spentYen == null || currentBudgetYen == null) return null;
  if (!Number.isFinite(spentYen) || !Number.isFinite(currentBudgetYen)) return null;
  if (spentYen < 0 || currentBudgetYen < 0) throw new RangeError("amount must be non-negative");
  if (currentBudgetYen === 0) return null;
  return spentYen / currentBudgetYen;
}

/**
 * 繰越率 = 翌年度繰越額 / 予算現額
 */
export function carryoverRate(
  carryoverYen: number | null | undefined,
  currentBudgetYen: number | null | undefined,
): number | null {
  if (carryoverYen == null || currentBudgetYen == null) return null;
  if (!Number.isFinite(carryoverYen) || !Number.isFinite(currentBudgetYen)) return null;
  if (carryoverYen < 0 || currentBudgetYen < 0) throw new RangeError("amount must be non-negative");
  if (currentBudgetYen === 0) return null;
  return carryoverYen / currentBudgetYen;
}

/**
 * 不用率 = 不用額 / 予算現額
 */
export function unusedRate(
  unusedYen: number | null | undefined,
  currentBudgetYen: number | null | undefined,
): number | null {
  if (unusedYen == null || currentBudgetYen == null) return null;
  if (!Number.isFinite(unusedYen) || !Number.isFinite(currentBudgetYen)) return null;
  if (unusedYen < 0 || currentBudgetYen < 0) throw new RangeError("amount must be non-negative");
  if (currentBudgetYen === 0) return null;
  return unusedYen / currentBudgetYen;
}

/**
 * 予算継続率 = 2026年度当初予算 / 2024年度当初予算
 */
export function budgetContinuationRate(
  fy2026InitialYen: number | null | undefined,
  fy2024InitialYen: number | null | undefined,
): number | null {
  if (fy2026InitialYen == null || fy2024InitialYen == null) return null;
  if (!Number.isFinite(fy2026InitialYen) || !Number.isFinite(fy2024InitialYen)) return null;
  if (fy2026InitialYen < 0 || fy2024InitialYen < 0)
    throw new RangeError("amount must be non-negative");
  if (fy2024InitialYen === 0) return null;
  return fy2026InitialYen / fy2024InitialYen;
}
