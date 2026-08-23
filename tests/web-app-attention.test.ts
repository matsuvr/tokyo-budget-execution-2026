import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("attention app wiring", () => {
  it("uses the full-item API and itemId detail cache on the normal path", async () => {
    const source = await readFile(new URL("../web/app.ts", import.meta.url), "utf8");
    assert.match(source, /fetchExecutionAttentionItems/u);
    assert.match(source, /expandedItemIds/u);
    assert.doesNotMatch(source, /fetchReviewCandidates|renderCandidateList/u);
  });
});
