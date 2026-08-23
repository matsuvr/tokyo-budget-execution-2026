import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createAttentionPaymentEvidenceBuilder } from "../src/execution-review/attention-payment-evidence.ts";
import { buildExecutionAttentionItems } from "../src/execution-review/attention-items.ts";
import { buildScanRecord } from "../src/execution-review/settlement/execution-scan.ts";
import type { ExecutionRecord } from "../src/execution-review/types.ts";

function item() {
  const record: ExecutionRecord = {
    fiscalYear: 2024,
    bureau: "",
    accountKey: {
      account: "一般会計",
      chapter: "10:土木費",
      section: "04:公園霊園費",
      item: "01:整備費",
      key: "一般会計:10:土木費:04:公園霊園費:01:整備費",
    },
    initialBudgetYen: 100,
    currentBudgetYen: 100,
    spentYen: 80,
    carryoverYen: 10,
    unusedYen: 10,
    sourcePage: 1,
    source: { title: "t", url: "https://example.test", page: 1, summary: "s" },
    executionMethod: "unknown",
  };
  return buildExecutionAttentionItems([buildScanRecord(record)])[0];
}

describe("attention payment evidence", () => {
  it("selects item evidence and keeps formal settlement amounts separate", () => {
    const attention = item();
    const builder = createAttentionPaymentEvidenceBuilder([attention]);
    builder.add({
      account: "一般会計",
      chapter: "土木費",
      item: "公園霊園費",
      object: "整備費",
      description: "工事委託",
      expenseSection: "委託料",
      expenseSubsection: null,
      amountYen: 50,
      paidAt: "2025-01-01",
      isClosingPeriod: false,
    });
    const evidence = builder.finalize()[0];
    assert.equal(evidence.matchGranularity, "item");
    assert.equal(evidence.totalAmountYen, 50);
    assert.equal(attention.amounts.spentYen, 80);
  });

  it("retains zero-match items", () => {
    const evidence = createAttentionPaymentEvidenceBuilder([item()]).finalize()[0];
    assert.equal(evidence.matchGranularity, "none");
    assert.equal(evidence.transactionCount, 0);
  });
});
