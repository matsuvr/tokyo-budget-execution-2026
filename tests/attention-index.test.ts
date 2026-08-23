import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAttentionIndex } from "../src/execution-review/attention-index.ts";
import { buildExecutionAttentionItems } from "../src/execution-review/attention-items.ts";
import { buildScanRecord } from "../src/execution-review/settlement/execution-scan.ts";
import type { ExecutionRecord } from "../src/execution-review/types.ts";

function record(item: string): ExecutionRecord {
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
    spentYen: 60,
    carryoverYen: 20,
    unusedYen: 20,
    sourcePage: 1,
    source: { title: "t", url: "https://example.test", page: 1, summary: "s" },
    executionMethod: "unknown",
  };
}

describe("attention index", () => {
  it("keeps scope totals separate and reconciled", () => {
    const items = buildExecutionAttentionItems([
      buildScanRecord(record("01:整備費")),
      buildScanRecord(record("退職手当")),
    ]);
    const index = buildAttentionIndex(items, 2);
    assert.equal(index.recordCount, 2);
    assert.equal(index.scopeCounts.operational, 1);
    assert.equal(index.scopeCounts["reference-only"], 1);
    assert.equal(index.totalsByScope.operational.yearEndUnexecutedYen, 40);
    assert.equal(index.comparisonCounts.unavailable, 2);
  });
});
