import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const PUBLIC_COPY_FILES = [
  "public/index.html",
  "web/labels.ts",
  "web/format.ts",
  "web/overview.ts",
  "web/attention-items.ts",
  "web/attention-detail.ts",
  "web/attention-filters.ts",
  "web/attention-bureaus.ts",
  "public/labels.js",
  "public/format.js",
  "public/overview.js",
  "public/attention-items.js",
  "public/attention-detail.js",
  "public/attention-filters.js",
  "public/attention-bureaus.js",
  "README.md",
  "DATA_DICTIONARY.md",
] as const;

const RENDERED_UI_FILES = [
  "public/index.html",
  "web/app.ts",
  "web/labels.ts",
  "web/format.ts",
  "web/overview.ts",
  "web/attention-items.ts",
  "web/attention-detail.ts",
  "web/attention-filters.ts",
  "web/attention-bureaus.ts",
  "public/app.js",
  "public/labels.js",
  "public/format.js",
  "public/overview.js",
  "public/attention-items.js",
  "public/attention-detail.js",
  "public/attention-filters.js",
  "public/attention-bureaus.js",
] as const;

for (const path of PUBLIC_COPY_FILES) {
  test(`${path} does not expose the old Japanese residual-budget label`, async () => {
    const content = await readFile(path, "utf8");
    assert.equal(content.includes("不用"), false, `${path} still contains the old public label`);
  });
}

for (const path of RENDERED_UI_FILES) {
  test(`${path} does not expose developer-facing caveats or investigation state`, async () => {
    const content = await readFile(path, "utf8");
    for (const forbidden of [
      "未確認",
      "未実施",
      "確認不能",
      "補助証拠",
      "断定するものでは",
      "代替にはしていません",
      "置き換えるものではありません",
      "追加で確認したい問い",
      "年度間対応",
      "対応信頼度",
      "照合粒度",
      "表示区分",
      "執行方式",
      "局の能力ランキングではありません",
      "データ生成後",
    ]) {
      assert.equal(content.includes(forbidden), false, `${path} exposes developer-facing copy: ${forbidden}`);
    }
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
