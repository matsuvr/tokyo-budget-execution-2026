import type { AttentionFlag, GapComposition } from "./types.ts";

export interface AttentionThresholds {
  materialUnexecutedAmountYen: number;
  highUnexecutedRate: number;
  continuedBudgetRate: number;
}

export const DEFAULT_ATTENTION_THRESHOLDS: Readonly<AttentionThresholds> = Object.freeze({
  materialUnexecutedAmountYen: 100_000_000,
  highUnexecutedRate: 0.2,
  continuedBudgetRate: 0.9,
});

export interface AttentionFlagInput {
  yearEndUnexecutedYen: number | null;
  yearEndUnexecutedRate: number | null;
  comparison: { budgetContinuationRate: number | null } | null;
  includeComparisonSignals?: boolean;
}

export function buildAttentionFlags(
  input: AttentionFlagInput,
  thresholds: AttentionThresholds = DEFAULT_ATTENTION_THRESHOLDS,
): AttentionFlag[] {
  const flags: AttentionFlag[] = [];
  if (input.yearEndUnexecutedYen != null && input.yearEndUnexecutedYen >= thresholds.materialUnexecutedAmountYen) {
    flags.push("material-unexecuted-amount");
  }
  if (input.yearEndUnexecutedRate != null && input.yearEndUnexecutedRate >= thresholds.highUnexecutedRate) {
    flags.push("high-unexecuted-rate");
  }
  if (input.includeComparisonSignals === false) return flags;

  const continuation = input.comparison?.budgetContinuationRate ?? null;
  if (continuation != null && continuation >= thresholds.continuedBudgetRate) flags.push("budget-continues");
  if (continuation != null && continuation > 1) flags.push("budget-expanded");
  if (input.comparison == null || continuation == null) flags.push("cross-year-comparison-unavailable");
  return flags;
}

export function classifyGapComposition(
  carryoverYen: number | null | undefined,
  unusedYen: number | null | undefined,
): GapComposition {
  if (carryoverYen == null || unusedYen == null) return "unavailable";
  if (carryoverYen > unusedYen) return "carryover-dominant";
  if (unusedYen > carryoverYen) return "unused-dominant";
  return "balanced";
}
