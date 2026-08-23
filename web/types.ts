/** Browser-facing types. Server modules are not imported at runtime. */
export type PolicyReviewStatus = "ready" | "pending";
export type ReviewScopeView = "operational" | "reference-only" | "uncertain";
export type AttentionFlagView =
  | "material-unexecuted-amount"
  | "high-unexecuted-rate"
  | "budget-continues"
  | "budget-expanded"
  | "cross-year-comparison-unavailable";
export type GapCompositionView =
  | "carryover-dominant"
  | "unused-dominant"
  | "balanced"
  | "unavailable";

export interface ScopeAmountTotalsView {
  currentBudgetYen: number;
  spentYen: number;
  carryoverYen: number;
  unusedYen: number;
  yearEndUnexecutedYen: number;
}

export interface AttentionIndexView {
  listPath: string;
  detailPath: string;
  bureauSummaryPath: string;
  recordCount: number;
  detailCount: number;
  scopeCounts: Record<ReviewScopeView, number>;
  comparisonCounts: { attached: number; unavailable: number };
  totalsByScope: Record<ReviewScopeView, ScopeAmountTotalsView>;
  flagCountsByScope: Record<ReviewScopeView, Record<AttentionFlagView, number>>;
}

export interface ExecutionReviewIndexView {
  scope: { account: string; note: string };
  comparisons: { comparableCount: number; byConfidence: Record<string, number> };
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
  attentionItems: AttentionIndexView | null;
}

export interface FeaturedReviewView {
  reviewId: string | null;
  comparisonId: string;
  policyTitle: string;
  bureau: string | null;
  executionMethod: string;
}

export interface EvidenceReferenceView {
  title: string;
  url: string;
  page: number | null;
  summary: string;
}

export interface AccountKeyView {
  account: string;
  chapter: string;
  section?: string | null;
  item?: string | null;
  key?: string;
}

export interface OptionalBudgetComparisonView {
  comparisonId: string;
  mappingId: string;
  confidence: string;
  relationType: string;
  granularity: string;
  matchLevel: "chapter" | "section";
  fy2024Keys: AccountKeyView[];
  fy2026Keys: AccountKeyView[];
  fy2024InitialBudgetYen: number | null;
  fy2026InitialBudgetYen: number | null;
  budgetContinuationRate: number | null;
}

export interface ExecutionAttentionItemView {
  itemId: string;
  fiscalYear: 2024;
  bureau: string;
  accountKey: Required<AccountKeyView>;
  executionMethod: string;
  reviewScope: ReviewScopeView;
  reviewScopeReasonCode: string | null;
  reviewScopeMatchedKeyword: string | null;
  amounts: {
    initialBudgetYen: number | null;
    currentBudgetYen: number;
    spentYen: number;
    carryoverYen: number;
    unusedYen: number;
    yearEndUnexecutedYen: number;
  };
  rates: {
    executionRate: number | null;
    carryoverRate: number | null;
    unusedRate: number | null;
    yearEndUnexecutedRate: number | null;
  };
  gapComposition: GapCompositionView;
  attentionFlags: AttentionFlagView[];
  comparison: OptionalBudgetComparisonView | null;
  sourcePage: number | null;
  source: EvidenceReferenceView;
}

export interface ExecutionAttentionItemsView {
  generatedAt: string;
  fiscalYear: 2024;
  recordCount: number;
  comparisonAttachedCount: number;
  comparisonUnavailableCount: number;
  scopeCounts: Record<ReviewScopeView, number>;
  records: ExecutionAttentionItemView[];
}

export interface AttentionBreakdownComponentView {
  itemId: string;
  bureau: string;
  accountKey: Required<AccountKeyView>;
  executionMethod: string;
  amounts: ScopeAmountTotalsView;
  sourcePage: number | null;
  source: EvidenceReferenceView;
}

export interface AttentionBreakdownView {
  itemId: string;
  comparisonId: string | null;
  comparisonLevel: "chapter" | "section" | null;
  components: AttentionBreakdownComponentView[];
  totals: ScopeAmountTotalsView;
  reconciliation: "exact" | "mismatch" | "not-applicable";
}

export interface NameAggregateView {
  name: string;
  count: number;
  amountYen: number;
}

export interface AttentionPaymentEvidenceView {
  itemId: string;
  comparisonId: string | null;
  matchGranularity: "item" | "section" | "chapter" | "none";
  transactionCount: number;
  totalAmountYen: number;
  ordinaryAmountYen: number;
  closingAmountYen: number;
  firstPaymentDate: string | null;
  lastPaymentDate: string | null;
  topPaymentNames: NameAggregateView[];
  expenseBreakdown: NameAggregateView[];
}

export interface InvestigationQuestionView {
  code: string;
  text: string;
}

export interface PolicyReviewDetailView {
  reviewId: string | null;
  comparisonId: string;
  policyTitle: string;
  bureau: string | null;
  confidence: string;
  executionMethod: string;
  analysis: {
    status: string;
    statusReasons: string[];
    selectionReason: string;
    rates: Record<string, number | null>;
    amounts: Record<string, number | null>;
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
  paymentEvidence: unknown;
}

export interface ExecutionAttentionDetailView {
  item: ExecutionAttentionItemView;
  breakdown: AttentionBreakdownView;
  paymentEvidence: AttentionPaymentEvidenceView;
  officialExplanation: {
    status: "confirmed" | "not-found" | "not-reviewed" | "not-applicable";
    detail: PolicyReviewDetailView | null;
  };
  investigationQuestions: InvestigationQuestionView[];
}

export interface AttentionBureauRowView {
  bureau: string;
  scope: ReviewScopeView;
  itemCount: number;
  amounts: ScopeAmountTotalsView;
  rates: { executionRate: number | null; yearEndUnexecutedRate: number | null };
  flagCounts: Record<AttentionFlagView, number>;
  comparisonAttachedCount: number;
  comparisonUnavailableCount: number;
}

export interface AttentionBureauSummaryView {
  generatedAt: string;
  fiscalYear: 2024;
  rowCount: number;
  rows: AttentionBureauRowView[];
}

/* Legacy response types retained for compatibility. */
export interface ReviewCandidatesView { records: ReviewCandidateView[] }
export interface ReviewCandidateView {
  comparisonId: string | null;
  mappingId: string;
  confidence: string;
  relationType: string;
  granularity: string;
  fy2024Keys: AccountKeyView[];
  fy2026Keys: AccountKeyView[];
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
  summary: {
    bureauCount: number;
    totalComparableCount: number;
    totalNeedsExplanationCount: number;
    totalFy2024CurrentBudgetYen: number;
    consistencyCheck: string;
  };
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
