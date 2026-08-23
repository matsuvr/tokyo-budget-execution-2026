import { executionRate, yearEndUnexecutedRate } from "./metrics.ts";
import type { ReviewScope } from "./review-scope.ts";
import type { AttentionFlag, ExecutionAttentionItem } from "./types.ts";

export const ATTENTION_FLAGS: readonly AttentionFlag[] = [
  "material-unexecuted-amount",
  "high-unexecuted-rate",
  "budget-continues",
  "budget-expanded",
  "cross-year-comparison-unavailable",
];

export interface AttentionBureauSummaryRow {
  bureau: string;
  scope: ReviewScope;
  itemCount: number;
  amounts: {
    currentBudgetYen: number;
    spentYen: number;
    carryoverYen: number;
    unusedYen: number;
    yearEndUnexecutedYen: number;
  };
  rates: {
    executionRate: number | null;
    yearEndUnexecutedRate: number | null;
  };
  flagCounts: Record<AttentionFlag, number>;
  comparisonAttachedCount: number;
  comparisonUnavailableCount: number;
}

function blankFlags(): Record<AttentionFlag, number> {
  return Object.fromEntries(ATTENTION_FLAGS.map((flag) => [flag, 0])) as Record<AttentionFlag, number>;
}

function safeAdd(a: number, b: number, label: string): number {
  const result = a + b;
  if (!Number.isSafeInteger(result)) throw new RangeError(`${label} exceeds safe integer range`);
  return result;
}

export function buildAttentionBureauSummary(
  items: readonly ExecutionAttentionItem[],
): AttentionBureauSummaryRow[] {
  const rows = new Map<string, AttentionBureauSummaryRow>();
  for (const item of items) {
    const mapKey = `${item.reviewScope}\u0000${item.bureau}`;
    const row = rows.get(mapKey) ?? {
      bureau: item.bureau,
      scope: item.reviewScope,
      itemCount: 0,
      amounts: {
        currentBudgetYen: 0,
        spentYen: 0,
        carryoverYen: 0,
        unusedYen: 0,
        yearEndUnexecutedYen: 0,
      },
      rates: { executionRate: null, yearEndUnexecutedRate: null },
      flagCounts: blankFlags(),
      comparisonAttachedCount: 0,
      comparisonUnavailableCount: 0,
    };
    row.itemCount += 1;
    for (const amountKey of Object.keys(row.amounts) as (keyof typeof row.amounts)[]) {
      row.amounts[amountKey] = safeAdd(
        row.amounts[amountKey],
        item.amounts[amountKey],
        `${item.bureau}:${amountKey}`,
      );
    }
    for (const flag of item.attentionFlags) row.flagCounts[flag] += 1;
    if (item.comparison == null) row.comparisonUnavailableCount += 1;
    else row.comparisonAttachedCount += 1;
    rows.set(mapKey, row);
  }

  for (const row of rows.values()) {
    row.rates.executionRate = executionRate(row.amounts.spentYen, row.amounts.currentBudgetYen);
    row.rates.yearEndUnexecutedRate = yearEndUnexecutedRate(
      row.amounts.carryoverYen,
      row.amounts.unusedYen,
      row.amounts.currentBudgetYen,
    );
  }

  const scopeOrder: Record<ReviewScope, number> = {
    operational: 0,
    "reference-only": 1,
    uncertain: 2,
  };
  return [...rows.values()].sort((a, b) =>
    scopeOrder[a.scope] - scopeOrder[b.scope] ||
    (a.scope === "operational" ? b.amounts.yearEndUnexecutedYen - a.amounts.yearEndUnexecutedYen : 0) ||
    a.bureau.localeCompare(b.bureau, "ja"),
  );
}
