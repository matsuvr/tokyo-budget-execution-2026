#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { extractPageTextItems } from "../src/execution-review/pdf/extract-text-items.ts";

/**
 * Issue #14: 代表ページ1ページだけを対象に、座標付きテキスト項目をJSONへ出力するCLI。
 *
 * 使い方:
 *   node --experimental-strip-types scripts/dump-pdf-page.ts <pdfPath> <pageNumber> [outPath]
 *
 * outPathを省略した場合は標準出力へ出力する。テストfixtureの生成を想定している。
 */

const [pdfArg, pageArg, outArg] = process.argv.slice(2);
if (!pdfArg || !pageArg) {
  console.error("usage: dump-pdf-page.ts <pdfPath> <pageNumber> [outPath]");
  process.exit(2);
}
const pageNumber = Number.parseInt(pageArg, 10);
if (!Number.isInteger(pageNumber) || pageNumber < 1) {
  console.error(`invalid pageNumber: ${pageArg}`);
  process.exit(2);
}

const pdfPath = resolve(pdfArg);
const pdfBytes = new Uint8Array(await readFile(pdfPath));
const items = await extractPageTextItems(pdfBytes, pageNumber);

const payload = {
  sourceFile: pdfArg,
  physicalPage: pageNumber,
  itemCount: items.length,
  items,
};
const json = `${JSON.stringify(payload, null, 1)}\n`;
if (outArg) {
  await writeFile(resolve(outArg), json, "utf8");
  console.log(`wrote ${items.length} items -> ${resolve(outArg)}`);
} else {
  process.stdout.write(json);
}
