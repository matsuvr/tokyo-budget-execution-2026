import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { attachBudgetComparisons, buildExecutionAttentionItems } from "../src/execution-review/attention-items.ts";
import { buildAttentionBreakdown } from "../src/execution-review/attention-breakdown.ts";
import { buildScanRecord } from "../src/execution-review/settlement/execution-scan.ts";
import type { ExecutionRecord } from "../src/execution-review/types.ts";

function record(item: string, carryoverYen: number, unusedYen: number): ExecutionRecord {
  return {
    fiscalYear: 2024,
    bureau: "",
    accountKey: {
      account: "一般会計",
      chapter: "10:土木費",
      section: "04:公園霊園費",
      item,
      key: `一般会計:10:土木費:04:公園霊園費:${item}`,
    },
    initialBudgetYen: 100,
    currentBudgetYen: 100,
    spentYen: 100 - carryoverYen - unusedYen,
    carryoverYen,
    unusedYen,
    sourcePage: 1,
    source: { title: "t", url: "https://example.test", page: 1, summary: "s" },
    executionMethod: "unknown",
  };
}

function comparison(spentYen: number) {
  return {
    comparisonId: "section",
    mappingId: "m",
    confidence: "A" as const,
    relationType: "exact",
    granularity: "item",
    fy2024Keys: [{ account: "一般会計", chapter: "10:土木費", section: "04:公園霊園費" }],
    fy2026Keys: [{ account: "一般会計", chapter: "10:土木費", section: "04:公園霊園費" }],
    amounts: {
      fy2024InitialBudgetYen: 200,
      fy2024CurrentBudgetYen: 200,
      fy2024SpentYen: spentYen,
      fy2024CarryoverYen: 30,
      fy2024UnusedYen: 30,
      fy2026InitialBudgetYen: 220,
    },
    rates: { budgetContinuationRate: 1.1 },
  };
}

describe("attention breakdown", () => {
  it("keeps every actual leaf component and reconciles exact totals", () => {
    const records = [buildScanRecord(record("01:A", 10, 10)), buildScanRecord(record("02:B", 20, 20))];
    const aggregate = comparison(140);
    const item = attachBudgetComparisons(buildExecutionAttentionItems(records), [aggregate])[0];
    const breakdown = buildAttentionBreakdown(item, records, [aggregate]);
    assert.equal(breakdown.components.length, 2);
    assert.equal(breakdown.reconciliation, "exact");
    assert.equal(breakdown.totals.yearEndUnexecutedYen, 60);
  });

  it("does not hide aggregate mismatches", () => {
    const records = [buildScanRecord(record("01:A", 10, 10)), buildScanRecord(record("02:B", 20, 20))];
    const aggregate = comparison(130);
    const item = attachBudgetComparisons(buildExecutionAttentionItems(records), [aggregate])[0];
    assert.equal(buildAttentionBreakdown(item, records, [aggregate]).reconciliation, "mismatch");
  });
});
