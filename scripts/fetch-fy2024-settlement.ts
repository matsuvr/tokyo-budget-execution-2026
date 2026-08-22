#!/usr/bin/env node
import { fetchDocument } from "./lib/fetch-document.ts";
import { PDF_MAGIC } from "../src/execution-review/download.ts";

/**
 * Issue #9: 令和6年度一般会計・特別会計歳入歳出決算の原本PDFを保存する。
 * - 入口ページ: https://www.kaikeikanri.metro.tokyo.lg.jp/information/update/r7/09/24/3
 * - 再実行しても既存の正常ファイルを破壊しない。
 * - このスクリプトはPDF本文を解析しない。
 */

const BASE = "https://www.kaikeikanri.metro.tokyo.lg.jp/documents/d/kaikeikanri";
const DEST = "data/raw/execution-review/fy2024/settlement";

const documents = [
  {
    id: "er-fy2024-settlement-all-accounts-statement",
    title: "東京都各会計歳入歳出決算書",
    remoteName: "06kessan-1",
    fileName: "tokyo-all-accounts-settlement-statement.pdf",
  },
  {
    id: "er-fy2024-settlement-general-account-detail",
    title: "歳入歳出決算事項別明細書（一般会計）",
    remoteName: "06kessan-2",
    fileName: "general-account-settlement-detail.pdf",
  },
  {
    id: "er-fy2024-settlement-reference-total-overview",
    title: "東京都決算参考書 決算の総括",
    remoteName: "06kessan-6",
    fileName: "settlement-reference-total-overview.pdf",
  },
  {
    id: "er-fy2024-settlement-reference-general-account",
    title: "東京都決算参考書 一般会計",
    remoteName: "06kessan-7",
    fileName: "settlement-reference-general-account.pdf",
  },
];

let failed = false;
for (const document of documents) {
  try {
    await fetchDocument(document.id, {
      url: `${BASE}/${document.remoteName}`,
      targetPath: `${DEST}/${document.fileName}`,
      magic: PDF_MAGIC,
      mime: "application/pdf",
    });
  } catch (error) {
    console.error(`FAILED\t${document.id}\t${String(error)}`);
    failed = true;
  }
}
console.log(`fy2024 settlement documents: ${documents.length}`);
if (failed) process.exit(1);
