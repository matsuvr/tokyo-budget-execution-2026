import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { add, isNonNegativeInteger } from "../src/lib/sample.ts";
import { parseCsv, stringifyCsv } from "../src/lib/csv.ts";

describe("add (pure sample)", () => {
  it("adds two numbers", () => {
    assert.equal(add(1, 2), 3);
    assert.equal(add(-1, 1), 0);
  });

  it("is pure: does not mutate inputs", () => {
    const a = 2;
    const b = 3;
    const result = add(a, b);
    assert.equal(result, 5);
    assert.equal(a, 2);
    assert.equal(b, 3);
  });
});

describe("isNonNegativeInteger (pure)", () => {
  it("accepts 0 and positive integers", () => {
    assert.equal(isNonNegativeInteger(0), true);
    assert.equal(isNonNegativeInteger(42), true);
  });

  it("rejects negatives, floats, NaN, Infinity", () => {
    assert.equal(isNonNegativeInteger(-1), false);
    assert.equal(isNonNegativeInteger(1.5), false);
    assert.equal(isNonNegativeInteger(Number.NaN), false);
    assert.equal(isNonNegativeInteger(Number.POSITIVE_INFINITY), false);
  });
});

describe("parseCsv / stringifyCsv (pure, no I/O)", () => {
  it("round-trips simple csv", () => {
    const rows = [
      ["a", "b", "c"],
      ["1", "2", "3"],
    ];
    const csv = stringifyCsv(rows);
    const parsed = parseCsv(csv);
    assert.deepEqual(parsed, rows);
  });

  it("handles quoted fields", () => {
    const csv = `"a,1","b""2",c\r\n`;
    const parsed = parseCsv(csv);
    assert.deepEqual(parsed, [["a,1", 'b"2', "c"]]);
  });
});
