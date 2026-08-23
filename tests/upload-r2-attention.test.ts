import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("R2 attention outputs", () => {
  it("requires every new public attention artifact exactly once", async () => {
    const source = await readFile(new URL("../scripts/upload-r2.ts", import.meta.url), "utf8");
    for (const name of [
      "execution-attention-items.json",
      "attention-payment-evidence.json",
      "execution-attention-details.json",
      "attention-bureau-summary.json",
    ]) {
      assert.equal(source.split(name).length - 1, 1, `${name} must appear exactly once`);
    }
  });
});
