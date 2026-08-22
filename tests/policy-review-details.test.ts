import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPolicyReviewDetails } from "../src/execution-review/policy-review-details.ts";

function baseSelection(overrides: Partial<Parameters<typeof buildPolicyReviewDetails>[0]["selections"][number]> = {}) {
  return {
    comparisonId: "cmp-0001",
    mappingId: "map-0001",
    policyTitle: "1:議会費",
    bureau: null,
    executionMethod: "direct" as const,
    selectionReason: "テスト用",
    ...overrides,
  };
}

function baseCandidate(overrides: Partial<Parameters<typeof buildPolicyReviewDetails>[0]["candidates"][number]> = {}) {
  return {
    comparisonId: "cmp-0001",
    mappingId: "map-0001",
    confidence: "A",
    granularity: "item",
    status: "needs-explanation",
    statusReasons: ["unusedRate>=0.2"],
    amounts: {
      fy2024InitialBudgetYen: 100,
      fy2024CurrentBudgetYen: 110,
      fy2024SpentYen: 80,
      fy2024CarryoverYen: 5,
      fy2024UnusedYen: 25,
      fy2026InitialBudgetYen: 120,
    },
    rates: {
      executionRate: 0.72,
      carryoverRate: 0.04,
      unusedRate: 0.22,
      budgetContinuationRate: 1.09,
    },
    ...overrides,
  };
}

function reviewRecord(overrides: Record<string, unknown> = {}) {
  return {
    reviewId: "rev-0001",
    comparisonId: "cmp-0001",
    policyTitle: "1:議会費",
    bureau: null,
    executionMethod: "direct",
    officialDescription: "説明",
    reasonStatus: "confirmed",
    reasonTags: ["other-official-reason"],
    improvementStatus: "not-found",
    improvementSummary: "",
    evidenceReferences: [
      { title: "資料", url: "https://www.metro.tokyo.lg.jp/", page: 1, summary: "要旨" },
    ],
    reviewerNotes: "メモ",
    ...overrides,
  };
}

describe("buildPolicyReviewDetails", () => {
  it("カテゴリ候補にレビューがちょうど1件あり、支払証拠を統合できる", () => {
    const result = buildPolicyReviewDetails({
      selections: [baseSelection()],
      reviewFiles: { "direct.json": { records: [reviewRecord()] } },
      candidates: [baseCandidate()],
      paymentCandidates: [
        {
          comparisonId: "cmp-0001",
          transactionCount: 3,
          totalAmountYen: 500,
          ordinaryAmountYen: 450,
          closingAmountYen: 50,
          topPaymentNames: [{ name: "件名A", count: 2, amountYen: 300 }],
        },
      ],
    });
    assert.deepEqual(result.errors, []);
    assert.equal(result.records.length, 1);
    const record = result.records[0]!;
    assert.equal(record.review?.officialDescription, "説明");
    assert.equal(record.paymentEvidence?.transactionCount, 3);
    assert.equal(record.analysis.status, "needs-explanation");
  });

  it("支払実績がない候補はpaymentEvidenceをnullで保持する", () => {
    const result = buildPolicyReviewDetails({
      selections: [baseSelection({ comparisonId: "cmp-0002", mappingId: "map-0002", executionMethod: "unknown" })],
      reviewFiles: { "direct.json": { records: [] } },
      candidates: [
        baseCandidate({ comparisonId: "cmp-0002", mappingId: "map-0002", status: "carryover" }),
      ],
      paymentCandidates: [
        {
          comparisonId: "cmp-0002",
          transactionCount: 0,
          totalAmountYen: 0,
          ordinaryAmountYen: 0,
          closingAmountYen: 0,
          topPaymentNames: [],
        },
      ],
    });
    assert.deepEqual(result.errors, []);
    assert.equal(result.records[0]!.review, null);
    assert.equal(result.records[0]!.paymentEvidence, null);
  });

  it("カテゴリ候補にレビューがない場合はエラー", () => {
    const result = buildPolicyReviewDetails({
      selections: [baseSelection()],
      reviewFiles: { "direct.json": { records: [] } },
      candidates: [baseCandidate()],
      paymentCandidates: [],
    });
    assert.ok(result.errors.some((e) => e.includes("レビューがない")));
  });

  it("同一comparisonIdへの重複レビューはエラー", () => {
    const result = buildPolicyReviewDetails({
      selections: [baseSelection()],
      reviewFiles: {
        "direct.json": { records: [reviewRecord()] },
        "procurement.json": { records: [reviewRecord({ executionMethod: "procurement" })] },
      },
      candidates: [baseCandidate()],
      paymentCandidates: [],
    });
    assert.ok(result.errors.some((e) => e.includes("複数のレビュー")));
  });

  it("執行方式の不一致はエラー", () => {
    const result = buildPolicyReviewDetails({
      selections: [baseSelection()],
      reviewFiles: {
        "construction.json": { records: [reviewRecord({ executionMethod: "construction" })] },
      },
      candidates: [baseCandidate()],
      paymentCandidates: [],
    });
    assert.ok(result.errors.some((e) => e.includes("不一致")));
  });

  it("選定ファイル・候補ファイル間の参照切れはエラー", () => {
    const result = buildPolicyReviewDetails({
      selections: [baseSelection()],
      reviewFiles: { "direct.json": { records: [] } },
      candidates: [],
      paymentCandidates: [],
    });
    assert.ok(result.errors.some((e) => e.includes("参照切れ")));
  });

  it("選定に存在しないcomparisonIdへのレビューはエラー", () => {
    const result = buildPolicyReviewDetails({
      selections: [baseSelection()],
      reviewFiles: {
        "direct.json": { records: [reviewRecord({ comparisonId: "cmp-9999" })] },
      },
      candidates: [baseCandidate()],
      paymentCandidates: [],
    });
    assert.ok(result.errors.some((e) => e.includes("cmp-9999")));
  });

  it("confirmed以外で改善策の要旨がある場合はエラー", () => {
    const result = buildPolicyReviewDetails({
      selections: [baseSelection()],
      reviewFiles: {
        "direct.json": {
          records: [reviewRecord({ improvementStatus: "not-found", improvementSummary: "推測文" })],
        },
      },
      candidates: [baseCandidate()],
      paymentCandidates: [],
    });
    assert.ok(result.errors.some((e) => e.includes("改善策の要旨")));
  });
});
