import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  executionRate,
  carryoverRate,
  unusedRate,
  budgetContinuationRate,
} from "../src/execution-review/metrics.ts";

describe("executionRate", () => {
  it("通常値", () => {
    assert.equal(executionRate(80, 100), 0.8);
    assert.equal(executionRate(0, 100), 0);
    assert.equal(executionRate(100, 100), 1);
  });

  it("分母0はnull", () => {
    assert.equal(executionRate(10, 0), null);
  });

  it("欠損値はnull", () => {
    assert.equal(executionRate(null, 100), null);
    assert.equal(executionRate(100, null), null);
    assert.equal(executionRate(undefined, 100), null);
  });

  it("0円執行は0を返す", () => {
    assert.equal(executionRate(0, 100_000_000), 0);
  });

  it("負数は例外", () => {
    assert.throws(() => executionRate(-1, 100), RangeError);
    assert.throws(() => executionRate(10, -5), RangeError);
  });

  it("入力を変更しない", () => {
    const spent = 50;
    const budget = 100;
    const result = executionRate(spent, budget);
    assert.equal(result, 0.5);
    assert.equal(spent, 50);
    assert.equal(budget, 100);
  });

  it("丸めを行わない（生の比率）", () => {
    // 1/3 は 0.333... をそのまま返す
    assert.equal(executionRate(1, 3), 1 / 3);
  });
});

describe("carryoverRate", () => {
  it("通常値", () => {
    assert.equal(carryoverRate(20, 100), 0.2);
  });
  it("分母0はnull", () => {
    assert.equal(carryoverRate(20, 0), null);
  });
  it("欠損", () => {
    assert.equal(carryoverRate(null, 100), null);
  });
  it("負数は例外", () => {
    assert.throws(() => carryoverRate(-1, 100), RangeError);
  });
});

describe("unusedRate", () => {
  it("通常値", () => {
    assert.equal(unusedRate(30, 100), 0.3);
  });
  it("分母0はnull", () => {
    assert.equal(unusedRate(30, 0), null);
  });
  it("欠損", () => {
    assert.equal(unusedRate(30, null), null);
  });
  it("負数は例外", () => {
    assert.throws(() => unusedRate(-10, 100), RangeError);
  });
});

describe("budgetContinuationRate", () => {
  it("通常値", () => {
    assert.equal(budgetContinuationRate(90, 100), 0.9);
  });
  it("100%超を許容", () => {
    assert.equal(budgetContinuationRate(150, 100), 1.5);
    assert.equal(budgetContinuationRate(200_000_000, 100_000_000), 2);
  });
  it("分母0はnull", () => {
    assert.equal(budgetContinuationRate(100, 0), null);
  });
  it("欠損値はnull", () => {
    assert.equal(budgetContinuationRate(null, 100), null);
    assert.equal(budgetContinuationRate(100, null), null);
  });
  it("負数は例外", () => {
    assert.throws(() => budgetContinuationRate(-1, 100), RangeError);
    assert.throws(() => budgetContinuationRate(100, -1), RangeError);
  });
  it("0円は0を返す（分子0）", () => {
    assert.equal(budgetContinuationRate(0, 100), 0);
  });
  it("非有限値はnull", () => {
    assert.equal(budgetContinuationRate(Number.NaN, 100), null);
    assert.equal(budgetContinuationRate(100, Number.POSITIVE_INFINITY), null);
  });
});
