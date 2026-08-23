import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const PUBLIC_COPY_FILES = [
  "public/index.html",
  "web/labels.ts",
  "web/overview.ts",
  "web/attention-items.ts",
  "web/attention-detail.ts",
  "web/attention-filters.ts",
  "web/attention-bureaus.ts",
  "public/labels.js",
  "public/overview.js",
  "public/attention-items.js",
  "public/attention-detail.js",
  "public/attention-filters.js",
  "public/attention-bureaus.js",
  "README.md",
  "DATA_DICTIONARY.md",
] as const;

for (const path of PUBLIC_COPY_FILES) {
  test(`${path} does not expose the old Japanese residual-budget label`, async () => {
    const content = await readFile(path, "utf8");
    assert.equal(content.includes("不用"), false, `${path} still contains the old public label`);
  });
}

test("public copy explains the policy-oriented interpretation without changing internal fields", async () => {
  const [index, readme, dictionary] = await Promise.all([
    readFile("public/index.html", "utf8"),
    readFile("README.md", "utf8"),
    readFile("DATA_DICTIONARY.md", "utf8"),
  ]);

  for (const content of [index, readme]) {
    assert.match(content, /年度内執行ギャップ額/u);
    assert.match(content, /年度内対応余地/u);
    assert.match(content, /翌年度継続分/u);
  }
  assert.match(dictionary, /`amounts\.unusedYen`/u);
  assert.match(dictionary, /年度内対応余地として表示する原値/u);
});
