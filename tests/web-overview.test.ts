import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("overview copy", () => {
  it("uses year-end execution gap as the primary concept", async () => {
    const source = await readFile(new URL("../web/overview.ts", import.meta.url), "utf8");
    assert.match(source, /年度内執行ギャップ額/u);
    assert.match(source, /年度内対応余地/u);
    assert.doesNotMatch(source, /年度内未執行額|不用率/u);
    assert.doesNotMatch(source, /要説明候補の件数|要説明候補の2024年度不用額合計/u);
  });
});
