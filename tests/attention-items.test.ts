import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { attachBudgetComparisons, buildExecutionAttentionItems } from "../src/execution-review/attention-items.ts";
import { buildScanRecord } from "../src/execution-review/settlement/execution-scan.ts";
import type { ExecutionRecord } from "../src/execution-review/types.ts";

function record(item: string): ExecutionRecord {
  return {
    fiscalYear: 2024,
    bureau: "",
    accountKey: { account: "一般会計", chapter: "10:土木費", section: "04:公園霊園費", item, key: `一般会計:10:土木費:04:公園霊園費:${item}` },
    initialBudgetYen: 100,
    currentBudgetYen: 100,
    spentYen: 60,
    carryoverYen: 20,
    unusedYen: 20,
    sourcePage: 1,
    source: { title: "t", url: "https://example.test", page: 1, summary: "s" },
    executionMethod: "unknown",
  };
}

describe("attention items", () => {
  it("uses leaf rows only and keeps comparison-null rows", () => {
    const items = buildExecutionAttentionItems([buildScanRecord(record("")), buildScanRecord(record("01:整備費"))]);
    assert.equal(items.length, 1);
    assert.equal(items[0].comparison, null);
    assert.ok(items[0].attentionFlags.includes("cross-year-comparison-unavailable"));
  });
  it("chooses section comparison over overlapping chapter comparison", () => {
    const items = buildExecutionAttentionItems([buildScanRecord(record("01:整備費"))]);
    const joined = attachBudgetComparisons(items, [
      { comparisonId: "chapter", mappingId: "m1", confidence: "B", relationType: "exact", granularity: "chapter", fy2024Keys: [{ account: "一般会計", chapter: "10:土木費" }], fy2026Keys: [{ account: "一般会計", chapter: "10:土木費" }], amounts: { fy2024InitialBudgetYen: 1000, fy2026InitialBudgetYen: 1000 }, rates: { budgetContinuationRate: 1 } },
      { comparisonId: "section", mappingId: "m2", confidence: "A", relationType: "exact", granularity: "item", fy2024Keys: [{ account: "一般会計", chapter: "10:土木費", section: "04:公園霊園費" }], fy2026Keys: [{ account: "一般会計", chapter: "10:土木費", section: "04:公園霊園費" }], amounts: { fy2024InitialBudgetYen: 100, fy2026InitialBudgetYen: 110 }, rates: { budgetContinuationRate: 1.1 } },
    ]);
    assert.equal(joined[0].comparison?.comparisonId, "section");
    assert.equal(joined[0].comparison?.matchLevel, "section");
    assert.ok(joined[0].attentionFlags.includes("budget-expanded"));
  });
  it("fails closed on ambiguous same-level matches", () => {
    const diagnostics: string[] = [];
    const items = buildExecutionAttentionItems([buildScanRecord(record("01:整備費"))]);
    const base = { mappingId: "m", confidence: "A" as const, relationType: "exact", granularity: "item", fy2024Keys: [{ account: "一般会計", chapter: "10:土木費", section: "04:公園霊園費" }], fy2026Keys: [], amounts: { fy2024InitialBudgetYen: 100, fy2026InitialBudgetYen: 100 }, rates: { budgetContinuationRate: 1 } };
    const joined = attachBudgetComparisons(items, [{ ...base, comparisonId: "a" }, { ...base, comparisonId: "b" }], (d) => diagnostics.push(d.itemId));
    assert.equal(joined[0].comparison, null);
    assert.equal(diagnostics.length, 1);
  });
});
