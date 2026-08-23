import type { AttentionBreakdown } from "./attention-breakdown.ts";
import type { AttentionPaymentEvidence } from "./attention-payment-evidence.ts";
import {
  questionsForExecutionMethod,
  type InvestigationQuestion,
} from "./investigation-questions.ts";
import type { ExecutionAttentionItem } from "./types.ts";

export type OfficialExplanationStatus =
  | "confirmed"
  | "not-found"
  | "not-reviewed"
  | "not-applicable";

export interface PolicyReviewDetailLike {
  comparisonId: string;
  reviewId?: string | null;
  review: {
    reasonStatus: "confirmed" | "not-found" | "not-applicable";
    improvementStatus: "confirmed" | "not-found" | "not-applicable";
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

export interface ExecutionAttentionDetail {
  item: ExecutionAttentionItem;
  breakdown: AttentionBreakdown;
  paymentEvidence: AttentionPaymentEvidence;
  officialExplanation: {
    status: OfficialExplanationStatus;
    detail: PolicyReviewDetailLike | null;
  };
  investigationQuestions: InvestigationQuestion[];
}

function explanationFor(
  item: ExecutionAttentionItem,
  policyByComparison: ReadonlyMap<string, PolicyReviewDetailLike>,
): ExecutionAttentionDetail["officialExplanation"] {
  if (item.reviewScope === "reference-only") {
    return { status: "not-applicable", detail: null };
  }
  const comparisonId = item.comparison?.comparisonId;
  if (comparisonId == null) return { status: "not-reviewed", detail: null };
  const detail = policyByComparison.get(comparisonId) ?? null;
  if (detail?.review == null) return { status: "not-reviewed", detail };
  const reason = detail.review.reasonStatus;
  const improvement = detail.review.improvementStatus;
  if (reason === "confirmed" || improvement === "confirmed") {
    return { status: "confirmed", detail };
  }
  if (reason === "not-found" || improvement === "not-found") {
    return { status: "not-found", detail };
  }
  return { status: "not-applicable", detail };
}

export function buildExecutionAttentionDetails(inputs: {
  items: readonly ExecutionAttentionItem[];
  breakdowns: readonly AttentionBreakdown[];
  paymentEvidence: readonly AttentionPaymentEvidence[];
  policyReviewDetails: readonly PolicyReviewDetailLike[];
}): ExecutionAttentionDetail[] {
  const breakdownById = new Map(inputs.breakdowns.map((value) => [value.itemId, value]));
  const paymentById = new Map(inputs.paymentEvidence.map((value) => [value.itemId, value]));
  const policyByComparison = new Map(
    inputs.policyReviewDetails.map((value) => [value.comparisonId, value]),
  );
  const details: ExecutionAttentionDetail[] = [];
  const seen = new Set<string>();
  for (const item of inputs.items) {
    if (seen.has(item.itemId)) throw new Error(`duplicate itemId: ${item.itemId}`);
    seen.add(item.itemId);
    const breakdown = breakdownById.get(item.itemId);
    const paymentEvidence = paymentById.get(item.itemId);
    if (breakdown == null) throw new Error(`missing breakdown: ${item.itemId}`);
    if (paymentEvidence == null) throw new Error(`missing payment evidence: ${item.itemId}`);
    details.push({
      item,
      breakdown,
      paymentEvidence,
      officialExplanation: explanationFor(item, policyByComparison),
      investigationQuestions:
        item.reviewScope === "reference-only"
          ? []
          : [...questionsForExecutionMethod(item.executionMethod)],
    });
  }
  return details.sort((a, b) => a.item.itemId.localeCompare(b.item.itemId, "ja"));
}
