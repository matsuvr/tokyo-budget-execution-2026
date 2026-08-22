import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildExecutionReviewIndex } from "../src/execution-review/review-index.ts";

const baseInput = {
  scanCounts: { total: 408, policyReviewTarget: 396, policyReviewExcluded: 12 },
  comparisonRecords: [
    { confidence: "A" },
    { confidence: "A" },
    { confidence: "B" },
  ],
  candidateRecords: [
    { status: "needs-explanation" },
    { status: "executed" },
    { status: "incomparable" },
  ],
  mappingConfidenceSummary: { A: 74, B: 3, C: 0, unmatched: 0 },
  bureauSummary: {
    bureauCount: 18,
    totalComparableCount: 77,
    totalNeedsExplanationCount: 4,
    totalFy2024CurrentBudgetYen: 100,
  },
  thresholds: { needsUnusedRate: 0.2 },
  policyDetails: null as null | {
    records: {
      reviewId: string | null;
      comparisonId: string;
      policyTitle: string;
      bureau: string | null;
      executionMethod: string;
    }[];
  },
};

describe("buildExecutionReviewIndex", () => {
  it("詳細未生成でもpendingでindexを構築できる", () => {
    const index = buildExecutionReviewIndex(baseInput);
    assert.equal(index.policyReviews.status, "pending");
    assert.equal(index.policyReviews.reviewedCount, 0);
    assert.deepEqual(index.policyReviews.featuredReviews, []);
    assert.equal(index.policyReviews.detailsFile, null);
    assert.equal(index.outputs.policyReviewDetails, undefined);
    assert.deepEqual(index.comparisons.byConfidence, { A: 2, B: 1, C: 0, unmatched: 0 });
    assert.deepEqual(index.reviewCandidates.byStatus, {
      "needs-explanation": 1,
      executed: 1,
      incomparable: 1,
    });
  });

  it("詳細生成済みならreadyになり、レビュー付きだけを掲載する", () => {
    const input = {
      ...baseInput,
      policyDetails: {
        records: [
          {
            reviewId: "rev-0001",
            comparisonId: "cmp-0001",
            policyTitle: "A",
            bureau: null,
            executionMethod: "direct",
          },
          {
            reviewId: null,
            comparisonId: "cmp-0002",
            policyTitle: "B",
            bureau: null,
            executionMethod: "unknown",
          },
        ],
      },
    };
    const index = buildExecutionReviewIndex(input);
    assert.equal(index.policyReviews.status, "ready");
    assert.equal(index.policyReviews.detailsFile, "data/normalized/execution-review/policy-review-details.json");
    assert.equal(index.policyReviews.featuredReviews.length, 1);
    assert.equal(index.policyReviews.featuredReviews[0]!.comparisonId, "cmp-0001");
    assert.notEqual(index.outputs.policyReviewDetails, undefined);
  });

  it("C/unmatchedは対応表summary側の件数で補完する", () => {
    const input = {
      ...baseInput,
      mappingConfidenceSummary: { A: 74, B: 3, C: 5, unmatched: 2 },
    };
    const index = buildExecutionReviewIndex(input);
    assert.equal(index.comparisons.byConfidence.C, 5);
    assert.equal(index.comparisons.byConfidence.unmatched, 2);
  });

  it("同一入力から決定的な出力になる", () => {
    const withDetails = {
      ...baseInput,
      policyDetails: {
        records: [
          {
            reviewId: "rev-0001",
            comparisonId: "cmp-0001",
            policyTitle: "A",
            bureau: null,
            executionMethod: "direct",
          },
        ],
      },
    };
    assert.deepEqual(buildExecutionReviewIndex(withDetails), buildExecutionReviewIndex(withDetails));
  });
});
