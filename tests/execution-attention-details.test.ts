import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAttentionBreakdown } from "../src/execution-review/attention-breakdown.ts";
import { buildExecutionAttentionDetails } from "../src/execution-review/attention-details.ts";
import { createAttentionPaymentEvidenceBuilder } from "../src/execution-review/attention-payment-evidence.ts";
import { buildExecutionAttentionItems } from "../src/execution-review/attention-items.ts";
import { buildScanRecord } from "../src/execution-review/settlement/execution-scan.ts";
import type { ExecutionRecord } from "../src/execution-review/types.ts";

function fixture(itemName = "01:整備費") {
  const record: ExecutionRecord = {
    fiscalYear: 2024,
    bureau: "",
    accountKey: {
      account: "一般会計",
      chapter: "10:土木費",
      section: "04:公園霊園費",
      item: itemName,
      key: `一般会計:10:土木費:04:公園霊園費:${itemName}`,
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
  const scan = buildScanRecord(record);
  const item = buildExecutionAttentionItems([scan])[0];
  return { scan, item };
}

describe("execution attention details", () => {
  it("distinguishes not-reviewed from not-found", () => {
    const { scan, item } = fixture();
    const details = buildExecutionAttentionDetails({
      items: [item],
      breakdowns: [buildAttentionBreakdown(item, [scan], [])],
      paymentEvidence: createAttentionPaymentEvidenceBuilder([item]).finalize(),
      policyReviewDetails: [],
    });
    assert.equal(details[0].officialExplanation.status, "not-reviewed");
    assert.equal(details[0].investigationQuestions.length, 1);
  });

  it("suppresses operational questions for reference-only rows", () => {
    const { scan, item } = fixture("退職手当");
    const details = buildExecutionAttentionDetails({
      items: [item],
      breakdowns: [buildAttentionBreakdown(item, [scan], [])],
      paymentEvidence: createAttentionPaymentEvidenceBuilder([item]).finalize(),
      policyReviewDetails: [],
    });
    assert.equal(item.reviewScope, "reference-only");
    assert.equal(details[0].officialExplanation.status, "not-applicable");
    assert.deepEqual(details[0].investigationQuestions, []);
  });
});
