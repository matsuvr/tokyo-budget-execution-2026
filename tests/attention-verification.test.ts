import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAttentionBureauSummary } from "../src/execution-review/attention-bureau-summary.ts";
import { buildAttentionBreakdown } from "../src/execution-review/attention-breakdown.ts";
import { buildExecutionAttentionDetails } from "../src/execution-review/attention-details.ts";
import { buildAttentionIndex } from "../src/execution-review/attention-index.ts";
import { createAttentionPaymentEvidenceBuilder } from "../src/execution-review/attention-payment-evidence.ts";
import { buildExecutionAttentionItems } from "../src/execution-review/attention-items.ts";
import { verifyAttentionOutputs } from "../src/execution-review/attention-verification.ts";
import { buildScanRecord } from "../src/execution-review/settlement/execution-scan.ts";
import type { ExecutionRecord } from "../src/execution-review/types.ts";

function record(): ExecutionRecord {
  return {
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
}

function validFixture() {
  const scan = buildScanRecord(record());
  const items = buildExecutionAttentionItems([scan]);
  const breakdowns = [buildAttentionBreakdown(items[0], [scan], [])];
  const payments = createAttentionPaymentEvidenceBuilder(items).finalize();
  const details = buildExecutionAttentionDetails({
    items,
    breakdowns,
    paymentEvidence: payments,
    policyReviewDetails: [],
  });
  return {
    scanLeafCount: 1,
    items,
    details,
    paymentEvidence: payments,
    breakdowns,
    index: buildAttentionIndex(items, details.length),
    bureauSummary: buildAttentionBureauSummary(items),
  };
}

describe("attention output verification", () => {
  it("accepts a fully consistent fixture", () => {
    assert.equal(verifyAttentionOutputs(validFixture()).pass, true);
  });

  it("reports the affected item id for an accounting mismatch", () => {
    const fixture = validFixture();
    fixture.items[0].amounts.unusedYen = 11;
    const result = verifyAttentionOutputs(fixture);
    assert.equal(result.pass, false);
    assert.ok(result.errors.some((error) => error.includes(fixture.items[0].itemId)));
  });
});
