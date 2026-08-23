import { ATTENTION_FLAGS } from "./attention-bureau-summary.ts";
import type { ReviewScope } from "./review-scope.ts";
import type { AttentionFlag, ExecutionAttentionItem } from "./types.ts";

export interface ScopeAmountTotals {
  currentBudgetYen: number;
  spentYen: number;
  carryoverYen: number;
  unusedYen: number;
  yearEndUnexecutedYen: number;
}

export interface AttentionIndexData {
  listPath: string;
  detailPath: string;
  bureauSummaryPath: string;
  recordCount: number;
  detailCount: number;
  scopeCounts: Record<ReviewScope, number>;
  comparisonCounts: { attached: number; unavailable: number };
  totalsByScope: Record<ReviewScope, ScopeAmountTotals>;
  flagCountsByScope: Record<ReviewScope, Record<AttentionFlag, number>>;
}

const SCOPES: readonly ReviewScope[] = ["operational", "reference-only", "uncertain"];

function emptyTotals(): Record<ReviewScope, ScopeAmountTotals> {
  const make = (): ScopeAmountTotals => ({
    currentBudgetYen: 0,
    spentYen: 0,
    carryoverYen: 0,
    unusedYen: 0,
    yearEndUnexecutedYen: 0,
  });
  return { operational: make(), "reference-only": make(), uncertain: make() };
}

function emptyFlagCounts(): Record<ReviewScope, Record<AttentionFlag, number>> {
  const make = () =>
    Object.fromEntries(ATTENTION_FLAGS.map((flag) => [flag, 0])) as Record<AttentionFlag, number>;
  return { operational: make(), "reference-only": make(), uncertain: make() };
}

function safeAdd(left: number, right: number, label: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new RangeError(`${label} exceeds safe integer range`);
  return result;
}

export function buildAttentionIndex(
  items: readonly ExecutionAttentionItem[],
  detailCount: number,
): AttentionIndexData {
  if (!Number.isSafeInteger(detailCount) || detailCount < 0) {
    throw new RangeError("detailCount must be a non-negative safe integer");
  }
  const scopeCounts: Record<ReviewScope, number> = {
    operational: 0,
    "reference-only": 0,
    uncertain: 0,
  };
  const totalsByScope = emptyTotals();
  const flagCountsByScope = emptyFlagCounts();
  let attached = 0;

  for (const item of items) {
    const scope = item.reviewScope;
    scopeCounts[scope] += 1;
    if (item.comparison != null) attached += 1;
    const target = totalsByScope[scope];
    for (const key of Object.keys(target) as (keyof ScopeAmountTotals)[]) {
      target[key] = safeAdd(target[key], item.amounts[key], `${scope}:${key}`);
    }
    for (const flag of item.attentionFlags) flagCountsByScope[scope][flag] += 1;
  }

  for (const scope of SCOPES) {
    const totals = totalsByScope[scope];
    if (totals.yearEndUnexecutedYen !== totals.carryoverYen + totals.unusedYen) {
      throw new Error(`year-end total mismatch for ${scope}`);
    }
  }

  return {
    listPath: "data/normalized/execution-review/execution-attention-items.json",
    detailPath: "data/normalized/execution-review/execution-attention-details.json",
    bureauSummaryPath: "data/normalized/execution-review/attention-bureau-summary.json",
    recordCount: items.length,
    detailCount,
    scopeCounts,
    comparisonCounts: { attached, unavailable: items.length - attached },
    totalsByScope,
    flagCountsByScope,
  };
}
