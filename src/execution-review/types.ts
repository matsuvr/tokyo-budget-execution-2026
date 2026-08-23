/**
 * 執行レビュー（2024年度正式決算 → 2026年度予算）で使うドメイン型。
 * 金額は円整数、率は0〜1のnumberまたはnullで保持する。
 */
import type { FiscalYear } from "../types.ts";
import type { ReviewScope, ReviewScopeReasonCode } from "./review-scope.ts";

export interface ExecutionAccountKey {
  account: string;
  chapter: string;
  section: string;
  item: string;
  key: string;
}

export type ExecutionMethod = "direct" | "procurement" | "construction" | "subsidy" | "statutory-transfer" | "unknown";
export type MappingConfidence = "A" | "B" | "C" | "unmatched";
export type ReviewStatus = "needs-explanation" | "carryover" | "review-reflected" | "executed" | "incomparable";

export interface EvidenceReference {
  title: string;
  url: string;
  page: number | null;
  summary: string;
}

export interface ExecutionRecord {
  fiscalYear: Extract<FiscalYear, 2024>;
  bureau: string;
  accountKey: ExecutionAccountKey;
  initialBudgetYen: number | null;
  currentBudgetYen: number;
  spentYen: number;
  carryoverYen: number;
  unusedYen: number;
  sourcePage: number | null;
  source: EvidenceReference;
  executionMethod: ExecutionMethod;
}

export interface BudgetComparisonRecord {
  comparisonId: string;
  accountKey2024: ExecutionAccountKey | null;
  accountKey2026: ExecutionAccountKey | null;
  comparisonUnit: "chapter" | "section" | "item" | "unmatched";
  budget2024InitialYen: number | null;
  budget2025InitialYen: number | null;
  budget2026InitialYen: number | null;
  mappingConfidence: MappingConfidence;
  execution2024: ExecutionRecord | null;
  executionRate: number | null;
  carryoverRate: number | null;
  unusedRate: number | null;
  budgetContinuationRate: number | null;
  reviewStatus: ReviewStatus;
  reason: string;
}

export type AttentionFlag = "material-unexecuted-amount" | "high-unexecuted-rate" | "budget-continues" | "budget-expanded" | "cross-year-comparison-unavailable";
export type GapComposition = "carryover-dominant" | "unused-dominant" | "balanced" | "unavailable";

export interface ComparisonSideKey {
  account: string;
  chapter: string;
  section?: string;
}

export interface OptionalBudgetComparison {
  comparisonId: string;
  mappingId: string;
  confidence: MappingConfidence;
  relationType: string;
  granularity: string;
  matchLevel: "chapter" | "section";
  fy2024Keys: ComparisonSideKey[];
  fy2026Keys: ComparisonSideKey[];
  fy2024InitialBudgetYen: number | null;
  fy2026InitialBudgetYen: number | null;
  budgetContinuationRate: number | null;
}

/** Main all-items dataset. Only lowest official settlement rows (目) become items. */
export interface ExecutionAttentionItem {
  itemId: string;
  fiscalYear: 2024;
  bureau: string;
  accountKey: ExecutionAccountKey;
  executionMethod: ExecutionMethod;
  reviewScope: ReviewScope;
  reviewScopeReasonCode: ReviewScopeReasonCode;
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
  gapComposition: GapComposition;
  attentionFlags: AttentionFlag[];
  comparison: OptionalBudgetComparison | null;
  sourcePage: number | null;
  source: EvidenceReference;
}
