import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("execution attention pipeline", () => {
  it("generates attention outputs before index and verification", async () => {
    const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
      scripts: Record<string, string>;
    };
    const pipeline = pkg.scripts["prepare:execution-review"];
    const ordered = [
      "build:execution-attention-items",
      "build:attention-payment-evidence",
      "build:execution-attention-details",
      "build:attention-bureau-summary",
      "build:index",
      "verify:execution-review",
    ];
    for (let index = 1; index < ordered.length; index += 1) {
      assert.ok(pipeline.indexOf(ordered[index - 1]) < pipeline.indexOf(ordered[index]));
    }
    assert.match(pkg.scripts["verify:execution-review"], /verify:execution-attention/u);
  });
});
