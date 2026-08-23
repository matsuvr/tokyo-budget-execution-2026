import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAttentionFlags, classifyGapComposition } from "../src/execution-review/attention-flags.ts";

describe("attention flags", () => {
  it("returns simultaneous facts in a fixed order", () => {
    assert.deepEqual(buildAttentionFlags({
      yearEndUnexecutedYen: 200_000_000,
      yearEndUnexecutedRate: 0.3,
      comparison: { budgetContinuationRate: 1.1 },
    }), ["material-unexecuted-amount", "high-unexecuted-rate", "budget-continues", "budget-expanded"]);
  });
  it("marks unavailable comparisons without deleting the row", () => {
    assert.deepEqual(buildAttentionFlags({ yearEndUnexecutedYen: 0, yearEndUnexecutedRate: 0, comparison: null }), ["cross-year-comparison-unavailable"]);
  });
  it("can omit comparison signals in the 2024-only scan", () => {
    assert.deepEqual(buildAttentionFlags({ yearEndUnexecutedYen: 200_000_000, yearEndUnexecutedRate: 0.3, comparison: null, includeComparisonSignals: false }), ["material-unexecuted-amount", "high-unexecuted-rate"]);
  });
});

describe("gap composition", () => {
  it("keeps carryover and unused distinct", () => {
    assert.equal(classifyGapComposition(30, 20), "carryover-dominant");
    assert.equal(classifyGapComposition(20, 30), "unused-dominant");
    assert.equal(classifyGapComposition(20, 20), "balanced");
    assert.equal(classifyGapComposition(null, 20), "unavailable");
  });
});
