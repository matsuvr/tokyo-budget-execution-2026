import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { yearEndUnexecutedRate, yearEndUnexecutedYen } from "../src/execution-review/metrics.ts";

describe("year-end unexecuted metrics", () => {
  it("adds carryover and unused amounts", () => {
    assert.equal(yearEndUnexecutedYen(30, 20), 50);
    assert.equal(yearEndUnexecutedRate(30, 20, 100), 0.5);
  });
  it("keeps missing and zero-denominator values null", () => {
    assert.equal(yearEndUnexecutedYen(null, 20), null);
    assert.equal(yearEndUnexecutedRate(30, 20, 0), null);
  });
  it("rejects negative and unsafe amounts", () => {
    assert.throws(() => yearEndUnexecutedYen(-1, 2), RangeError);
    assert.throws(() => yearEndUnexecutedYen(Number.MAX_SAFE_INTEGER, 1), RangeError);
  });
});
