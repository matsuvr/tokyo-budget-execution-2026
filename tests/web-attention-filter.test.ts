import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyAttentionFilters,
  defaultAttentionFilters,
  sortAttentionItems,
} from "../web/attention-filter.ts";
import type { ExecutionAttentionItemView } from "../web/types.ts";

function item(id: string, scope: ExecutionAttentionItemView["reviewScope"], amount: number, rate: number | null): ExecutionAttentionItemView {
  return {
    itemId: id,
    fiscalYear: 2024,
    bureau: "土木費",
    accountKey: { account: "一般会計", chapter: "土木費", section: "公園費", item: id, key: id },
    executionMethod: "unknown",
    reviewScope: scope,
    reviewScopeReasonCode: null,
    reviewScopeMatchedKeyword: null,
    amounts: { initialBudgetYen: 100, currentBudgetYen: 100, spentYen: 100 - amount, carryoverYen: amount, unusedYen: 0, yearEndUnexecutedYen: amount },
    rates: { executionRate: 1 - amount / 100, carryoverRate: amount / 100, unusedRate: 0, yearEndUnexecutedRate: rate },
    gapComposition: "carryover-dominant",
    attentionFlags: [],
    comparison: null,
    sourcePage: 1,
    source: { title: "t", url: "https://example.test", page: 1, summary: "s" },
  };
}

describe("attention filter", () => {
  it("defaults to all operational rows ordered by unexecuted amount", () => {
    const records = [item("a", "operational", 10, 0.1), item("b", "reference-only", 90, 0.9), item("c", "operational", 50, 0.5)];
    const filtered = applyAttentionFilters(records, defaultAttentionFilters());
    assert.deepEqual(sortAttentionItems(filtered, "unexecuted-amount-desc").map((value) => value.itemId), ["c", "a"]);
  });
  it("puts null rates last with deterministic ties", () => {
    const records = [item("b", "operational", 10, null), item("a", "operational", 10, null), item("c", "operational", 10, 0.1)];
    assert.deepEqual(sortAttentionItems(records, "unexecuted-rate-desc").map((value) => value.itemId), ["c", "a", "b"]);
  });
});
