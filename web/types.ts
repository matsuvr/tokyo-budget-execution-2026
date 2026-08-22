/**
 * 執行レビューAPIの表示用型（Issue #47）。
 * サーバー側の型をruntime importせず、画面が使うフィールドだけを再定義する。
 */

export type PolicyReviewStatus = "ready" | "pending";

export interface ExecutionReviewIndexView {
  scope: {
    account: string;
    note: string;
  };
  comparisons: {
    comparableCount: number;
    byConfidence: Record<string, number>;
  };
  reviewCandidates: {
    count: number;
    byStatus: Record<string, number>;
    thresholds: Record<string, number>;
  };
  bureauSummary: {
    bureauCount: number;
    totalComparableCount: number;
    totalNeedsExplanationCount: number;
    totalFy2024CurrentBudgetYen: number;
  };
  policyReviews: {
    status: PolicyReviewStatus;
    reviewedCount: number;
    featuredReviews: FeaturedReviewView[];
  };
}

export interface FeaturedReviewView {
  reviewId: string | null;
  comparisonId: string;
  policyTitle: string;
  bureau: string | null;
  executionMethod: string;
}

export type ReviewCandidateStatus =
  | "needs-explanation"
  | "carryover"
  | "review-reflected"
  | "executed"
  | "incomparable";

export interface ReviewCandidatesView {
  records: ReviewCandidateView[];
}

export interface ReviewCandidateView {
  comparisonId: string | null;
  mappingId: string;
  confidence: string;
  granularity: string;
  status: string;
  statusReasons: string[];
  amounts: {
    fy2024InitialBudgetYen: number | null;
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

export interface BureauSummaryView {
  bureaus: BureauRowView[];
}

export interface BureauRowView {
  chapter: string;
  comparableCount: number;
  needsExplanationCount: number;
  carryoverCount: number;
  reviewReflectedCount: number;
  executedCount: number;
  incomparableCount: number;
  fy2024CurrentBudgetYen: number;
  fy2024SpentYen: number;
  fy2024CarryoverYen: number;
  fy2024UnusedYen: number;
  fy2026InitialBudgetYen: number;
}

export interface EvidenceReferenceView {
  title: string;
  url: string;
  page: number | null;
  summary: string;
}

export interface PolicyReviewDetailView {
  reviewId: string | null;
  comparisonId: string;
  policyTitle: string;
  bureau: string | null;
  executionMethod: string;
  analysis: {
    status: string;
    statusReasons: string[];
    selectionReason: string;
    rates: ReviewCandidateView["rates"];
    amounts: ReviewCandidateView["amounts"];
  };
  review: {
    officialDescription: string;
    reasonStatus: string;
    reasonTags: string[];
    improvementStatus: string;
    improvementSummary: string;
    evidenceReferences: EvidenceReferenceView[];
    reviewerNotes: string;
  } | null;
  paymentEvidence: {
    transactionCount: number;
    totalAmountYen: number;
    ordinaryAmountYen: number;
    closingAmountYen: number;
    topPaymentNames: { name: string; count: number; amountYen: number }[];
  } | null;
}
