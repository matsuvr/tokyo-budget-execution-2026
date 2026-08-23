import { ATTENTION_FLAGS, type AttentionBureauSummaryRow } from "./attention-bureau-summary.ts";
import type { AttentionBreakdown } from "./attention-breakdown.ts";
import type { AttentionPaymentEvidence } from "./attention-payment-evidence.ts";
import type { ExecutionAttentionDetail } from "./attention-details.ts";
import type { AttentionIndexData, ScopeAmountTotals } from "./attention-index.ts";
import type { ReviewScope } from "./review-scope.ts";
import type { AttentionFlag, ExecutionAttentionItem } from "./types.ts";

export type AttentionIndexVerificationView = Pick<
  AttentionIndexData,
  "recordCount" | "detailCount" | "scopeCounts" | "comparisonCounts" | "totalsByScope"
>;

export interface AttentionVerificationResult {
  pass: boolean;
  errors: string[];
  counts: Record<string, number>;
}

const SCOPES: readonly ReviewScope[] = ["operational", "reference-only", "uncertain"];
const ZERO_TOTALS: ScopeAmountTotals = {
  currentBudgetYen: 0,
  spentYen: 0,
  carryoverYen: 0,
  unusedYen: 0,
  yearEndUnexecutedYen: 0,
};

function addError(errors: string[], message: string): void {
  if (errors.length < 200) errors.push(message);
}

function emptyScopeCounts(): Record<ReviewScope, number> {
  return { operational: 0, "reference-only": 0, uncertain: 0 };
}

function emptyScopeTotals(): Record<ReviewScope, ScopeAmountTotals> {
  return {
    operational: { ...ZERO_TOTALS },
    "reference-only": { ...ZERO_TOTALS },
    uncertain: { ...ZERO_TOTALS },
  };
}

function safeAdd(left: number, right: number, label: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new RangeError(`${label} exceeds safe integer range`);
  return result;
}

function addAmounts(target: ScopeAmountTotals, amounts: ScopeAmountTotals, label: string): void {
  for (const key of Object.keys(target) as (keyof ScopeAmountTotals)[]) {
    target[key] = safeAdd(target[key], amounts[key], `${label}:${key}`);
  }
}

function totalsFromItems(items: readonly ExecutionAttentionItem[]): Record<ReviewScope, ScopeAmountTotals> {
  const totals = emptyScopeTotals();
  for (const item of items) addAmounts(totals[item.reviewScope], item.amounts, item.itemId);
  return totals;
}

function totalsFromBureaus(rows: readonly AttentionBureauSummaryRow[]): Record<ReviewScope, ScopeAmountTotals> {
  const totals = emptyScopeTotals();
  for (const row of rows) addAmounts(totals[row.scope], row.amounts, row.bureau);
  return totals;
}

function sameCounts(left: Record<ReviewScope, number>, right: Record<ReviewScope, number>): boolean {
  return SCOPES.every((scope) => left[scope] === right[scope]);
}

function sameTotals(
  left: Record<ReviewScope, ScopeAmountTotals>,
  right: Record<ReviewScope, ScopeAmountTotals>,
): boolean {
  return SCOPES.every((scope) =>
    (Object.keys(ZERO_TOTALS) as (keyof ScopeAmountTotals)[]).every(
      (key) => left[scope][key] === right[scope][key],
    ),
  );
}

export function verifyAttentionOutputs(inputs: {
  scanLeafCount: number;
  items: readonly ExecutionAttentionItem[];
  details: readonly ExecutionAttentionDetail[];
  paymentEvidence: readonly AttentionPaymentEvidence[];
  breakdowns: readonly AttentionBreakdown[];
  index: AttentionIndexVerificationView;
  bureauSummary: readonly AttentionBureauSummaryRow[];
}): AttentionVerificationResult {
  const errors: string[] = [];
  const knownFlags = new Set<AttentionFlag>(ATTENTION_FLAGS);
  if (inputs.scanLeafCount !== inputs.items.length) {
    addError(errors, `record-count: scan=${inputs.scanLeafCount} items=${inputs.items.length}`);
  }

  const itemIds = new Set<string>();
  const scopeCounts = emptyScopeCounts();
  for (const item of inputs.items) {
    if (itemIds.has(item.itemId)) addError(errors, `duplicate-item-id:${item.itemId}`);
    itemIds.add(item.itemId);
    scopeCounts[item.reviewScope] += 1;
    if (
      item.amounts.currentBudgetYen !==
      item.amounts.spentYen + item.amounts.carryoverYen + item.amounts.unusedYen
    ) {
      addError(errors, `accounting-identity:${item.itemId}`);
    }
    if (
      item.amounts.yearEndUnexecutedYen !==
      item.amounts.carryoverYen + item.amounts.unusedYen
    ) {
      addError(errors, `year-end-identity:${item.itemId}`);
    }
    if (item.source.url.trim().length === 0) addError(errors, `source-url:${item.itemId}`);
    if (item.sourcePage != null && (!Number.isInteger(item.sourcePage) || item.sourcePage <= 0)) {
      addError(errors, `source-page:${item.itemId}`);
    }
    if (
      item.comparison == null &&
      !item.attentionFlags.includes("cross-year-comparison-unavailable")
    ) {
      addError(errors, `missing-unavailable-flag:${item.itemId}`);
    }
    for (const flag of item.attentionFlags) {
      if (!knownFlags.has(flag)) addError(errors, `unknown-flag:${item.itemId}:${flag}`);
    }
  }

  const detailIds = new Set(inputs.details.map((detail) => detail.item.itemId));
  const paymentIds = new Set(inputs.paymentEvidence.map((value) => value.itemId));
  const breakdownIds = new Set(inputs.breakdowns.map((value) => value.itemId));
  for (const id of itemIds) {
    if (!detailIds.has(id)) addError(errors, `missing-detail:${id}`);
    if (!paymentIds.has(id)) addError(errors, `missing-payment:${id}`);
    if (!breakdownIds.has(id)) addError(errors, `missing-breakdown:${id}`);
  }
  if (detailIds.size !== itemIds.size) addError(errors, `detail-count:${detailIds.size}/${itemIds.size}`);
  if (paymentIds.size !== itemIds.size) addError(errors, `payment-count:${paymentIds.size}/${itemIds.size}`);
  if (breakdownIds.size !== itemIds.size) addError(errors, `breakdown-count:${breakdownIds.size}/${itemIds.size}`);

  for (const breakdown of inputs.breakdowns) {
    const totals = breakdown.components.reduce<ScopeAmountTotals>(
      (sum, component) => {
        addAmounts(sum, component.amounts, breakdown.itemId);
        return sum;
      },
      { ...ZERO_TOTALS },
    );
    if ((Object.keys(totals) as (keyof ScopeAmountTotals)[]).some((key) => totals[key] !== breakdown.totals[key])) {
      addError(errors, `breakdown-total:${breakdown.itemId}`);
    }
    if (breakdown.reconciliation === "mismatch") {
      addError(errors, `breakdown-reconciliation:${breakdown.itemId}`);
    }
  }

  const comparisonAttached = inputs.items.filter((item) => item.comparison != null).length;
  const comparisonUnavailable = inputs.items.length - comparisonAttached;
  if (!sameCounts(scopeCounts, inputs.index.scopeCounts)) addError(errors, "index-scope-counts");
  if (
    inputs.index.comparisonCounts.attached !== comparisonAttached ||
    inputs.index.comparisonCounts.unavailable !== comparisonUnavailable
  ) {
    addError(errors, "index-comparison-counts");
  }
  const expectedTotals = totalsFromItems(inputs.items);
  if (!sameTotals(expectedTotals, inputs.index.totalsByScope)) addError(errors, "index-scope-totals");
  if (inputs.index.recordCount !== inputs.items.length || inputs.index.detailCount !== inputs.details.length) {
    addError(errors, "index-record-counts");
  }

  const bureauTotals = totalsFromBureaus(inputs.bureauSummary);
  if (!sameTotals(bureauTotals, expectedTotals)) addError(errors, "bureau-scope-totals");

  return {
    pass: errors.length === 0,
    errors,
    counts: {
      items: inputs.items.length,
      details: inputs.details.length,
      payments: inputs.paymentEvidence.length,
      breakdowns: inputs.breakdowns.length,
      errors: errors.length,
    },
  };
}
