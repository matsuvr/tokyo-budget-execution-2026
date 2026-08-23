import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildScanRecord, isLeafExecutionRecord, rankScanRecords } from "../src/execution-review/settlement/execution-scan.ts";
import type { ExecutionRecord } from "../src/execution-review/types.ts";

function record(key: string, item: string, carryoverYen: number, unusedYen: number): ExecutionRecord {
  return {
    fiscalYear: 2024,
    bureau: "",
    accountKey: { account: "一般会計", chapter: "10:土木費", section: "04:公園霊園費", item, key },
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

describe("execution gap scan", () => {
  it("adds combined year-end facts without comparison flags", () => {
    const scan = buildScanRecord(record("a", "01:A", 30, 20));
    assert.equal(scan.yearEndUnexecuted.amountYen, 50);
    assert.equal(scan.yearEndUnexecuted.rate, 0.5);
    assert.deepEqual(scan.attentionFlags, ["high-unexecuted-rate"]);
    assert.equal(scan.reviewScope.scope, "operational");
  });
  it("recognizes only the lowest official hierarchy as a main item", () => {
    assert.equal(isLeafExecutionRecord(record("a", "01:A", 0, 0)), true);
    assert.equal(isLeafExecutionRecord(record("b", "", 0, 0)), false);
  });
  it("ranks carryover-heavy rows by combined year-end amount", () => {
    const carryoverHeavy = buildScanRecord(record("a", "01:A", 80, 1));
    const unusedHeavy = buildScanRecord(record("b", "02:B", 0, 70));
    assert.deepEqual(rankScanRecords([unusedHeavy, carryoverHeavy], { field: "yearEndUnexecutedAmount" }).map((x) => x.key), ["a", "b"]);
  });
});
