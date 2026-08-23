import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAttentionBureauSummary } from "../src/execution-review/attention-bureau-summary.ts";
import { buildExecutionAttentionItems } from "../src/execution-review/attention-items.ts";
import { buildScanRecord } from "../src/execution-review/settlement/execution-scan.ts";
import type { ExecutionRecord } from "../src/execution-review/types.ts";

function record(item: string, currentBudgetYen: number, spentYen: number): ExecutionRecord {
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
    initialBudgetYen: currentBudgetYen,
    currentBudgetYen,
    spentYen,
    carryoverYen: 0,
    unusedYen: currentBudgetYen - spentYen,
    sourcePage: 1,
    source: { title: "t", url: "https://example.test", page: 1, summary: "s" },
    executionMethod: "unknown",
  };
}

describe("attention bureau summary", () => {
  it("recalculates rates from aggregate amounts rather than averaging row rates", () => {
    const items = buildExecutionAttentionItems([
      buildScanRecord(record("01:A", 100, 0)),
      buildScanRecord(record("02:B", 900, 900)),
    ]);
    const row = buildAttentionBureauSummary(items)[0];
    assert.equal(row.rates.executionRate, 0.9);
    assert.equal(row.rates.yearEndUnexecutedRate, 0.1);
  });
});
