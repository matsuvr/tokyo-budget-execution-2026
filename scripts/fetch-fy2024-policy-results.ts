#!/usr/bin/env node
import { fetchDocument } from "./lib/fetch-document.ts";
import { PDF_MAGIC } from "../src/execution-review/download.ts";

/**
 * Issue #10: 令和6年度主要施策の成果をrawへ保存する。
 * - 入口ページ: https://www.zaimu.metro.tokyo.lg.jp/zaisei/zaisei/shuyousisakunoseika/syuyo
 * - 令和6年度は本編・目次一体の単一PDFのみが公開されており、分割版・別索引は存在しない。
 * - 再実行しても既存の正常ファイルを破壊しない。
 * - このスクリプトはPDF本文を解析しない。
 */

const DEST = "data/raw/execution-review/fy2024/major-policy-results";

const documents = [
  {
    id: "er-fy2024-major-policy-results",
    title: "令和6年度 主要施策の成果（本編・目次一体）",
    url: "https://www.zaimu.metro.tokyo.lg.jp/documents/d/zaimu/20250924shuyousisakunoseika",
    fileName: "major-policy-results.pdf",
  },
];

let failed = false;
for (const document of documents) {
  try {
    await fetchDocument(document.id, {
      url: document.url,
      targetPath: `${DEST}/${document.fileName}`,
      magic: PDF_MAGIC,
      mime: "application/pdf",
    });
  } catch (error) {
    console.error(`FAILED\t${document.id}\t${String(error)}`);
    failed = true;
  }
}
console.log(`fy2024 major policy results documents: ${documents.length}`);
if (failed) process.exit(1);
