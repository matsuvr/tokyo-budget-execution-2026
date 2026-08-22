import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyCandidateFilters,
  availableBureaus,
  defaultFilters,
} from "../web/filter.ts";
import type { ReviewCandidateView } from "../web/types.ts";

function candidate(overrides: Partial<ReviewCandidateView> = {}): ReviewCandidateView {
  return {
    comparisonId: "cmp-0001",
    mappingId: "map-0001",
    confidence: "A",
    relationType: "exact",
    granularity: "item",
    fy2024Keys: [{ account: "一般会計", chapter: "9:産業労働費", section: "6:施設整備費" }],
    fy2026Keys: [{ account: "一般会計", chapter: "09:産業労働費", section: "06:施設整備費" }],
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

describe("applyCandidateFilters", () => {
  const records = [
    candidate({ comparisonId: "cmp-0001", status: "needs-explanation", confidence: "A" }),
    candidate({ comparisonId: "cmp-0002", status: "executed", confidence: "B" }),
    candidate({
      comparisonId: "cmp-0003",
      status: "needs-explanation",
      confidence: "C",
      fy2024Keys: [{ account: "一般会計", chapter: "12:教育費" }],
    }),
  ];

  it("既定条件（needs-explanation＋信頼度A/B）でAND絞り込みする", () => {
    const filtered = applyCandidateFilters(records, defaultFilters());
    assert.deepEqual(
      filtered.map((r) => r.comparisonId),
      ["cmp-0001"],
    );
  });

  it("状態・局・信頼度をANDで組み合わせる", () => {
    const filtered = applyCandidateFilters(records, {
      status: "needs-explanation",
      bureau: "教育費",
      confidences: ["A", "B", "C"],
    });
    assert.deepEqual(filtered.map((r) => r.comparisonId), ["cmp-0003"]);
  });

  it("all指定と空の信頼度集合は絞り込みなしとして扱う", () => {
    const filtered = applyCandidateFilters(records, {
      status: "all",
      bureau: "all",
      confidences: [],
    });
    assert.equal(filtered.length, records.length);
  });

  it("入力配列の順序を保つ", () => {
    const filtered = applyCandidateFilters([...records].reverse(), {
      status: "needs-explanation",
      bureau: "all",
      confidences: [],
    });
    assert.deepEqual(filtered.map((r) => r.comparisonId), ["cmp-0003", "cmp-0001"]);
  });
});

describe("availableBureaus", () => {
  it("款名から局名一覧を重複なし・昇順で返す", () => {
    const bureaus = availableBureaus([
      candidate({ fy2024Keys: [{ account: "一般会計", chapter: "12:教育費" }] }),
      candidate({}),
      candidate({}),
    ]);
    assert.deepEqual(bureaus, ["教育費", "産業労働費"]);
  });
});
