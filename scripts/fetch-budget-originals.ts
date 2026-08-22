#!/usr/bin/env node
import { fetchDocument } from "./lib/fetch-document.ts";
import { PDF_MAGIC } from "../src/execution-review/download.ts";

/**
 * Issue #12: 令和6年度・令和8年度の予算比較原本を揃える。
 * - R6入口ページ: https://www.zaimu.metro.tokyo.lg.jp/zaisei/yosan/r6/6yosangaiyounituite
 * - R8入口ページ: https://www.metro.tokyo.lg.jp/information/press/2026/01/2026013039
 * - 既存の data/raw/documents/fy2026/* と同一内容のファイルは複製しない
 *   （SHA-256で確認済み: 概要・図解・主要事業・補助金総点検は既存パスを再利用）。
 * - 再実行しても既存の正常ファイルを破壊しない。このスクリプトは解析を行わない。
 */

const documents = [
  {
    id: "er-fy2024-budget-overview-integrated",
    title: "令和6年度予算概要（統合版）",
    url: "https://www.zaimu.metro.tokyo.lg.jp/documents/d/zaimu/6yosangaiyou1-1",
    targetPath: "data/raw/execution-review/fy2024/budget/budget-overview-integrated.pdf",
  },
  {
    id: "er-fy2024-budget-general-account",
    title: "令和6年度予算概要 分割版 第1 一般会計",
    url: "https://www.zaimu.metro.tokyo.lg.jp/documents/d/zaimu/6yosangaiyou3",
    targetPath: "data/raw/execution-review/fy2024/budget/budget-general-account.pdf",
  },
  {
    id: "er-fy2026-budget-major-policies",
    title: "令和8年度予算案 主要な施策",
    url: "https://www.metro.tokyo.lg.jp/documents/d/tosei/20260130_39_04",
    targetPath: "data/raw/execution-review/fy2026/budget/major-policies.pdf",
  },
  {
    id: "er-fy2026-budget-counting-table",
    title: "令和8年度予算案 計数表",
    url: "https://www.metro.tokyo.lg.jp/documents/d/tosei/20260130_39_09",
    targetPath: "data/raw/execution-review/fy2026/budget/counting-table.pdf",
  },
];

let failed = false;
for (const document of documents) {
  try {
    await fetchDocument(document.id, {
      url: document.url,
      targetPath: document.targetPath,
      magic: PDF_MAGIC,
      mime: "application/pdf",
    });
  } catch (error) {
    console.error(`FAILED\t${document.id}\t${String(error)}`);
    failed = true;
  }
}
console.log(`budget original documents: ${documents.length}`);
if (failed) process.exit(1);
