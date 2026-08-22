import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sortBureausForDisplay, verifyBureauTotals } from "../web/bureau-sort.ts";
import type { BureauRowView } from "../web/types.ts";

function bureau(overrides: Partial<BureauRowView>): BureauRowView {
  return {
    chapter: "福祉費",
    comparableCount: 1,
    needsExplanationCount: 0,
    carryoverCount: 0,
    reviewReflectedCount: 0,
    executedCount: 1,
    incomparableCount: 0,
    fy2024CurrentBudgetYen: 100,
    fy2024SpentYen: 90,
    fy2024CarryoverYen: 5,
    fy2024UnusedYen: 5,
    fy2026InitialBudgetYen: 110,
    ...overrides,
  };
}

describe("sortBureausForDisplay", () => {
  it("要説明候補件数の降順、同数なら不用額の降順で並べる", () => {
    const sorted = sortBureausForDisplay([
      bureau({ chapter: "A", needsExplanationCount: 0, fy2024UnusedYen: 500 }),
      bureau({ chapter: "B", needsExplanationCount: 2, fy2024UnusedYen: 100 }),
      bureau({ chapter: "C", needsExplanationCount: 2, fy2024UnusedYen: 300 }),
    ]);
    assert.deepEqual(
      sorted.map((b) => b.chapter),
      ["C", "B", "A"],
    );
  });
});

describe("verifyBureauTotals", () => {
  const bureaus = [
    bureau({ chapter: "A", comparableCount: 3, fy2024CurrentBudgetYen: 300 }),
    bureau({ chapter: "B", comparableCount: 4, fy2024CurrentBudgetYen: 400 }),
  ];

  it("局別行の合計がsummaryと一致する場合consistentを返す", () => {
    const result = verifyBureauTotals(bureaus, {
      totalComparableCount: 7,
      totalFy2024CurrentBudgetYen: 700,
    });
    assert.equal(result.consistent, true);
    assert.deepEqual(result.mismatches, []);
  });

  it("不一致がある場合mismatchesを返す", () => {
    const result = verifyBureauTotals(bureaus, {
      totalComparableCount: 8,
      totalFy2024CurrentBudgetYen: 700,
    });
    assert.equal(result.consistent, false);
    assert.equal(result.mismatches.length, 1);
  });
});
