import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildReviewCandidates,
  type ComparisonInput,
} from "../src/execution-review/settlement/review-candidates.ts";

function comparison(overrides: {
  mappingId: string;
  currentBudgetYen: number;
  unusedYen?: number;
  fy2026Yen?: number;
  relationType?: string;
}): ComparisonInput {
  const current = overrides.currentBudgetYen;
  const unused = overrides.unusedYen ?? 0;
  return {
    mappingId: overrides.mappingId,
    confidence: "A",
    relationType: overrides.relationType ?? "exact",
    granularity: "chapter",
    fy2024Keys: [{ chapter: "02:総務費" }],
    amounts: {
      fy2024CurrentBudgetYen: current,
      fy2024SpentYen: current - unused,
      fy2024CarryoverYen: 0,
      fy2024UnusedYen: unused,
      fy2026InitialBudgetYen: overrides.fy2026Yen ?? current,
    },
    rates: {
      executionRate: current > 0 ? (current - unused) / current : null,
      carryoverRate: 0,
      unusedRate: current > 0 ? unused / current : null,
      budgetContinuationRate: current > 0 ? (overrides.fy2026Yen ?? current) / current : null,
    },
  };
}

const noExclusion = () => ({ excluded: false, reasonCode: null });

describe("buildReviewCandidates", () => {
  it("要説明候補を先頭に不用額降順で並べる", () => {
    const rows = buildReviewCandidates(
      [
        // 要説明: 不用率20%以上・現額1億以上・継続率90%以上
        comparison({ mappingId: "m-small", currentBudgetYen: 200_000_000, unusedYen: 50_000_000 }),
        comparison({ mappingId: "m-big", currentBudgetYen: 500_000_000, unusedYen: 150_000_000 }),
        // 執行済み（後ろへ）
        comparison({ mappingId: "m-exec", currentBudgetYen: 300_000_000, unusedYen: 0 }),
      ],
      { exclusionLookup: noExclusion },
    );
    assert.deepEqual(
      rows.map((row) => row.mappingId),
      ["m-big", "m-small", "m-exec"],
    );
    assert.equal(rows[0].status, "needs-explanation");
    assert.equal(rows[2].status, "executed");
  });

  it("閾値境界は#6のテストと一致する（20%ちょうどは要説明）", () => {
    const rows = buildReviewCandidates(
      [
        comparison({
          mappingId: "m-boundary",
          currentBudgetYen: 100_000_000, // 1億円ちょうど
          unusedYen: 20_000_000, // 20%ちょうど
          fy2026Yen: 90_000_000, // 90%ちょうど
        }),
      ],
      { exclusionLookup: noExclusion },
    );
    assert.equal(rows[0].status, "needs-explanation");
    assert.ok(rows[0].statusReasons.includes("unusedRate>=0.2"));
  });

  it("対象外科目を削除せず除外理由付きで保持する", () => {
    const rows = buildReviewCandidates(
      [comparison({ mappingId: "m-debt", currentBudgetYen: 500_000_000, unusedYen: 0 })],
      {
        exclusionLookup: (chapter) =>
          chapter === "総務費"
            ? { excluded: true, reasonCode: "public-debt" }
            : { excluded: false, reasonCode: null },
      },
    );
    assert.equal(rows[0].policyReviewExcluded, true);
    assert.equal(rows[0].exclusionReasonCode, "public-debt");
    assert.equal(rows.length, 1);
  });

  it("merged明示の低執行はreview-reflectedになる", () => {
    const rows = buildReviewCandidates(
      [
        comparison({
          mappingId: "m-merged",
          currentBudgetYen: 500_000_000,
          unusedYen: 200_000_000, // 40%
          fy2026Yen: 100_000_000, // 継続率20%（<50%）
          relationType: "merged",
        }),
      ],
      { exclusionLookup: noExclusion },
    );
    assert.equal(rows[0].status, "review-reflected");
  });
});
