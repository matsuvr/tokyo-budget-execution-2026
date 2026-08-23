/**
 * 執行レビューで使う基本指標の純粋関数。
 * - 丸めは行わず生の比率を返す。表示時のみ整形する。
 * - 分母が 0 または null/undefined なら null を返す（0で補完しない）。
 * - 負数は RangeError を投げる。
 */

function validateAmount(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  if (value < 0) throw new RangeError(`${name} must be non-negative`);
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer`);
}

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

/** 年度内未執行額 = 翌年度繰越額 + 不用額。 */
export function yearEndUnexecutedYen(
  carryoverYen: number | null | undefined,
  unusedYen: number | null | undefined,
): number | null {
  if (carryoverYen == null || unusedYen == null) return null;
  validateAmount(carryoverYen, "carryoverYen");
  validateAmount(unusedYen, "unusedYen");
  const total = carryoverYen + unusedYen;
  if (!Number.isSafeInteger(total)) throw new RangeError("yearEndUnexecutedYen exceeds safe integer range");
  return total;
}

/** 年度内未執行率 = (翌年度繰越額 + 不用額) / 予算現額。 */
export function yearEndUnexecutedRate(
  carryoverYen: number | null | undefined,
  unusedYen: number | null | undefined,
  currentBudgetYen: number | null | undefined,
): number | null {
  if (currentBudgetYen == null) return null;
  if (!Number.isFinite(currentBudgetYen)) return null;
  if (currentBudgetYen < 0) throw new RangeError("currentBudgetYen must be non-negative");
  if (currentBudgetYen === 0) return null;
  const amount = yearEndUnexecutedYen(carryoverYen, unusedYen);
  return amount == null ? null : amount / currentBudgetYen;
}
