import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyReviewStatus, DEFAULT_THRESHOLDS } from "../src/execution-review/classify.ts";
import type { ClassifyInput } from "../src/execution-review/classify.ts";

describe("classifyReviewStatus", () => {
  it("要説明候補: 不用率20%以上・1億円以上・継続率90%以上", () => {
    const input: ClassifyInput = {
      executionRate: 0.5,
      carryoverRate: 0,
      unusedRate: 0.25,
      budgetContinuationRate: 0.95,
      currentBudgetYen: 200_000_000,
      mappingConfidence: "A",
    };
    assert.equal(classifyReviewStatus(input), "needs-explanation");
  });

  it("境界: 20%ちょうど・1億円ちょうど・90%ちょうどは要説明", () => {
    const input: ClassifyInput = {
      executionRate: 0.7,
      carryoverRate: 0,
      unusedRate: 0.2,
      budgetContinuationRate: 0.9,
      currentBudgetYen: 100_000_000,
      mappingConfidence: "A",
    };
    assert.equal(classifyReviewStatus(input), "needs-explanation");
  });

  it("境界未満は要説明にならない", () => {
    const justBelow: ClassifyInput = {
      executionRate: 0.7,
      carryoverRate: 0,
      unusedRate: 0.199,
      budgetContinuationRate: 0.9,
      currentBudgetYen: 100_000_000,
      mappingConfidence: "A",
    };
    assert.notEqual(classifyReviewStatus(justBelow), "needs-explanation");

    const budgetJustBelow: ClassifyInput = {
      executionRate: 0.7,
      carryoverRate: 0,
      unusedRate: 0.2,
      budgetContinuationRate: 0.9,
      currentBudgetYen: 99_999_999,
      mappingConfidence: "A",
    };
    assert.notEqual(classifyReviewStatus(budgetJustBelow), "needs-explanation");

    const contJustBelow: ClassifyInput = {
      executionRate: 0.7,
      carryoverRate: 0,
      unusedRate: 0.2,
      budgetContinuationRate: 0.899,
      currentBudgetYen: 100_000_000,
      mappingConfidence: "A",
    };
    assert.notEqual(classifyReviewStatus(contJustBelow), "needs-explanation");
  });

  it("遅延・繰越: 繰越率20%以上で不用率20%未満", () => {
    const input: ClassifyInput = {
      executionRate: 0.5,
      carryoverRate: 0.25,
      unusedRate: 0.1,
      budgetContinuationRate: 0.95,
      currentBudgetYen: 200_000_000,
      mappingConfidence: "A",
    };
    assert.equal(classifyReviewStatus(input), "carryover");
  });

  it("繰越と不用が同時に大きい場合は要説明が優先", () => {
    const input: ClassifyInput = {
      executionRate: 0.4,
      carryoverRate: 0.3,
      unusedRate: 0.3,
      budgetContinuationRate: 0.95,
      currentBudgetYen: 200_000_000,
      mappingConfidence: "A",
    };
    // needs-explanation が carryover より優先
    assert.equal(classifyReviewStatus(input), "needs-explanation");
  });

  it("対応信頼度Cは強制的に incomparable", () => {
    const input: ClassifyInput = {
      executionRate: 0.5,
      carryoverRate: 0,
      unusedRate: 0.3,
      budgetContinuationRate: 0.95,
      currentBudgetYen: 200_000_000,
      mappingConfidence: "C",
    };
    assert.equal(classifyReviewStatus(input), "incomparable");
  });

  it("unmatched も incomparable", () => {
    const input: ClassifyInput = {
      executionRate: 0.95,
      carryoverRate: 0,
      unusedRate: 0,
      budgetContinuationRate: 1,
      currentBudgetYen: 200_000_000,
      mappingConfidence: "unmatched",
    };
    assert.equal(classifyReviewStatus(input), "incomparable");
  });

  it("見直し反映: 低執行かつ継続率50%未満", () => {
    const input: ClassifyInput = {
      executionRate: 0.4,
      carryoverRate: 0,
      unusedRate: 0.25,
      budgetContinuationRate: 0.4,
      currentBudgetYen: 200_000_000,
      mappingConfidence: "A",
    };
    assert.equal(classifyReviewStatus(input), "review-reflected");
  });

  it("見直し反映: 廃止・統合明示で継続率が高くても反映", () => {
    const input: ClassifyInput = {
      executionRate: 0.4,
      carryoverRate: 0,
      unusedRate: 0.25,
      budgetContinuationRate: 0.95,
      currentBudgetYen: 200_000_000,
      mappingConfidence: "A",
      isDiscontinuedOrMerged: true,
    };
    assert.equal(classifyReviewStatus(input), "review-reflected");
  });

  it("執行済み: 執行率90%以上", () => {
    const input: ClassifyInput = {
      executionRate: 0.9,
      carryoverRate: 0,
      unusedRate: 0.05,
      budgetContinuationRate: 1,
      currentBudgetYen: 50_000_000,
      mappingConfidence: "A",
    };
    assert.equal(classifyReviewStatus(input), "executed");
  });

  it("90%ちょうどは執行済み", () => {
    const input: ClassifyInput = {
      executionRate: 0.9,
      carryoverRate: 0,
      unusedRate: 0,
      budgetContinuationRate: null,
      currentBudgetYen: 50_000_000,
      mappingConfidence: "B",
    };
    assert.equal(classifyReviewStatus(input), "executed");
  });

  it("境界に当てはまらない場合は incomparable", () => {
    const input: ClassifyInput = {
      executionRate: 0.5,
      carryoverRate: 0.1,
      unusedRate: 0.1,
      budgetContinuationRate: 0.7,
      currentBudgetYen: 50_000_000,
      mappingConfidence: "A",
    };
    assert.equal(classifyReviewStatus(input), "incomparable");
  });

  it("入力を変更しない", () => {
    const input: ClassifyInput = {
      executionRate: 0.8,
      carryoverRate: 0,
      unusedRate: 0.1,
      budgetContinuationRate: 1,
      currentBudgetYen: 200_000_000,
      mappingConfidence: "A",
    };
    const copy = { ...input };
    classifyReviewStatus(input);
    assert.deepEqual(input, copy);
  });

  it("閾値を外から渡せる", () => {
    const customThresholds = {
      ...DEFAULT_THRESHOLDS,
      needsUnusedRate: 0.3,
    };
    const input: ClassifyInput = {
      executionRate: 0.5,
      carryoverRate: 0,
      unusedRate: 0.25,
      budgetContinuationRate: 0.95,
      currentBudgetYen: 200_000_000,
      mappingConfidence: "A",
    };
    // デフォルトなら needs-explanation だが、カスタムでは閾値未満で incomparable
    assert.equal(classifyReviewStatus(input, DEFAULT_THRESHOLDS), "needs-explanation");
    assert.equal(classifyReviewStatus(input, customThresholds), "incomparable");
  });
});
