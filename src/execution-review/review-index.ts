/**
 * 執行レビュー概要index（Issue #41）のデータ契約と構築ロジック。
 *
 * - 全体スキャン・比較・候補・局別サマリーの収録範囲と件数を1つにまとめる。
 * - 重点レビュー詳細（#40）が存在する場合だけ ready 状態で掲載する。
 * - generatedAt を除き、同じ入力から決定的な出力を返す。
 */

export interface FeaturedReview {
  reviewId: string | null;
  comparisonId: string;
  policyTitle: string;
  bureau: string | null;
  executionMethod: string;
}

export interface ExecutionReviewIndexInput {
  /** 全体スキャン（fy2024）の件数。ファイルがなければnull */
  scanCounts: { total: number; policyReviewTarget: number; policyReviewExcluded: number } | null;
  /** 比較レコードの信頼度分布（budget-comparisons.json） */
  comparisonRecords: readonly { confidence: string }[];
  /** 候補レコードの状態分布（review-candidates.json） */
  candidateRecords: readonly { status: string }[];
  /** 対応表の信頼度別件数（account-mappings.json の summary。C/unmatched含む） */
  mappingConfidenceSummary: Record<string, number>;
  /** 局別サマリーの集計（bureau-summary.json） */
  bureauSummary: {
    bureauCount: number;
    totalComparableCount: number;
    totalNeedsExplanationCount: number;
    totalFy2024CurrentBudgetYen: number;
  };
  /** 初期スクリーニング閾値（review-candidates.json の thresholds） */
  thresholds: Record<string, number>;
  /** 重点レビュー詳細（policy-review-details.json）。未生成ならnull */
  policyDetails: {
    records: readonly {
      reviewId: string | null;
      comparisonId: string;
      policyTitle: string;
      bureau: string | null;
      executionMethod: string;
    }[];
  } | null;
}

export interface ExecutionReviewIndexData {
  scope: {
    fiscalYears: { settlement: 2024; budget: 2026 };
    account: "一般会計";
    note: string;
  };
  scan: (ExecutionReviewIndexInput["scanCounts"] & { file: string }) | null;
  comparisons: {
    file: string;
    comparableCount: number;
    byConfidence: Record<string, number>;
  };
  reviewCandidates: {
    file: string;
    count: number;
    byStatus: Record<string, number>;
    thresholds: Record<string, number>;
  };
  bureauSummary: ExecutionReviewIndexInput["bureauSummary"] & { file: string };
  policyReviews: {
    status: "ready" | "pending";
    detailsFile: string | null;
    reviewedCount: number;
    featuredReviews: FeaturedReview[];
  };
  outputs: Record<string, string>;
  cautions: string[];
}

const DETAILS_FILE = "data/normalized/execution-review/policy-review-details.json";

/** 既知の4信頼度を常に列挙し、未知キーも保持する */
function confidenceCounts(
  records: readonly { confidence: string }[],
  mappingSummary: Record<string, number>,
): Record<string, number> {
  const counts: Record<string, number> = { A: 0, B: 0, C: 0, unmatched: 0 };
  for (const record of records) counts[record.confidence] = (counts[record.confidence] ?? 0) + 1;
  // 比較ファイルはA/Bのみ収録のため、対応表summaryのC/unmatched件数で補完する
  for (const key of ["C", "unmatched"] as const) {
    counts[key] = Math.max(counts[key] ?? 0, mappingSummary[key] ?? 0);
  }
  return counts;
}

export function buildExecutionReviewIndex(input: ExecutionReviewIndexInput): ExecutionReviewIndexData {
  const byStatus: Record<string, number> = {};
  for (const record of input.candidateRecords) {
    byStatus[record.status] = (byStatus[record.status] ?? 0) + 1;
  }
  const byConfidence = confidenceCounts(input.comparisonRecords, input.mappingConfidenceSummary);

  const featuredReviews: FeaturedReview[] = input.policyDetails
    ? input.policyDetails.records
        .filter((r) => r.reviewId != null)
        .slice(0, 20)
        .map((r) => ({
          reviewId: r.reviewId,
          comparisonId: r.comparisonId,
          policyTitle: r.policyTitle,
          bureau: r.bureau,
          executionMethod: r.executionMethod,
        }))
    : [];
  const reviewedCount = featuredReviews.length;

  return {
    scope: {
      fiscalYears: { settlement: 2024, budget: 2026 },
      account: "一般会計",
      note: "対象は一般会計のみ。普通会計（一般会計＋公営企業会計等＋一部特別会計）とは集計範囲が異なるため数値を混同しない。",
    },
    scan:
      input.scanCounts == null
        ? null
        : {
            ...input.scanCounts,
            file: "data/normalized/execution-review/fy2024/execution-scan.json",
          },
    comparisons: {
      file: "data/normalized/execution-review/budget-comparisons.json",
      comparableCount: input.comparisonRecords.length,
      byConfidence,
    },
    reviewCandidates: {
      file: "data/normalized/execution-review/review-candidates.json",
      count: input.candidateRecords.length,
      byStatus,
      thresholds: { ...input.thresholds },
    },
    bureauSummary: { ...input.bureauSummary, file: "data/normalized/execution-review/bureau-summary.json" },
    policyReviews: {
      status: input.policyDetails == null ? "pending" : "ready",
      detailsFile: input.policyDetails == null ? null : DETAILS_FILE,
      reviewedCount,
      featuredReviews,
    },
    outputs: {
      executionScan: "data/normalized/execution-review/fy2024/execution-scan.json",
      budgetComparisons: "data/normalized/execution-review/budget-comparisons.json",
      reviewCandidates: "data/normalized/execution-review/review-candidates.json",
      bureauSummary: "data/normalized/execution-review/bureau-summary.json",
      paymentEvidence: "data/normalized/execution-review/payment-evidence.json",
      ...(input.policyDetails == null ? {} : { policyReviewDetails: DETAILS_FILE }),
    },
    cautions: [
      "本indexの対象は一般会計。普通会計とは集計範囲が異なるため、決算参考書等の普通会計ベースの数値と混同しない。",
      "公金支出情報は正式決算（令和6年度一般会計歳入歳出決算事項別明細書）の代替にしない。支払件名・金額は補助証拠としてのみ使う。",
      "執行率=支出済額/予算現額。公金支出明細を分子にしない。",
      "C/unmatchedの対応は比較出力に含まれず、対応表(account-mappings.json)でのみ管理される。",
    ],
  };
}
