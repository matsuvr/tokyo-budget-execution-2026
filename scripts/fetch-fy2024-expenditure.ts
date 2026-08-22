#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fetchDocument } from "./lib/fetch-document.ts";
import { ZIP_MAGIC, isZipBytes } from "../src/execution-review/download.ts";

/**
 * Issue #11: 令和6年度公金支出14か月分と給与関係費をrawへ保存する。
 * - 入口ページ: https://www.kaikeikanri.metro.tokyo.lg.jp/about/jyouhoukoukai/koukinsisyutsu/06koukaidata
 * - 通常月12件 + 出納整理期間2件 + 給与関係費1件のXLSXを取得する。
 * - 出納整理期間はファイル名とmetadata（id・タイトル）で通常月と区別する。
 * - 再実行しても既存の正常ファイルを破壊しない。このスクリプトは正規化しない。
 */

const BASE = "https://www.kaikeikanri.metro.tokyo.lg.jp/documents/d/kaikeikanri";
const DEST = "data/raw/public-expenditure/fy2024";

/** 欠落月を機械的に検出するための期待ファイル一覧。 */
const expectedFiles = [
  { month: "2024-04", remoteName: "0604koukinsisyutsu_1", closing: false },
  { month: "2024-05", remoteName: "0605koukinsisyutsu_1", closing: false },
  { month: "2024-06", remoteName: "0606koukinsisyutsu_1", closing: false },
  { month: "2024-07", remoteName: "0607koukinsisyutsu_1", closing: false },
  { month: "2024-08", remoteName: "0608koukinsisyutsu_1", closing: false },
  { month: "2024-09", remoteName: "0609koukinsisyutsu_1", closing: false },
  { month: "2024-10", remoteName: "0610koukinsisyutsu_1", closing: false },
  { month: "2024-11", remoteName: "0611koukinsisyutsu_1-1", closing: false },
  { month: "2024-12", remoteName: "0612koukinsisyutsu_1", closing: false },
  { month: "2025-01", remoteName: "0701koukinsisyutsu_1", closing: false },
  { month: "2025-02", remoteName: "0702koukinsisyutsu_1", closing: false },
  { month: "2025-03", remoteName: "0703koukinsisyutsu-1-", closing: false },
  { month: "2025-04", remoteName: "0704_suit_koukinsisyutsu-1-", closing: true },
  { month: "2025-05", remoteName: "0705_suit_koukinsisyutsu-1-1", closing: true },
].map((entry) => ({
  ...entry,
  id: `er-fy2024-expenditure-${entry.closing ? "closing-" : ""}${entry.month}`,
  fileName: `${entry.month}${entry.closing ? "-closing" : ""}.xlsx`,
}));

const payroll = {
  id: "er-fy2024-expenditure-payroll",
  remoteName: "06koukinsisyutsukyuuyo-3-",
  fileName: "payroll.xlsx",
};

let failed = false;
for (const entry of [...expectedFiles.map((entry) => ({ id: entry.id, remoteName: entry.remoteName, fileName: entry.fileName })), payroll]) {
  try {
    await fetchDocument(entry.id, {
      url: `${BASE}/${entry.remoteName}`,
      targetPath: `${DEST}/${entry.fileName}`,
      magic: ZIP_MAGIC,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  } catch (error) {
    console.error(`FAILED\t${entry.id}\t${String(error)}`);
    failed = true;
  }
}

// 欠落月の機械的検出: ZIPとして不正な既存ファイルも欠落扱いする。
const missing = [];
for (const entry of [...expectedFiles, payroll]) {
  const path = `${DEST}/${entry.fileName}`;
  if (!existsSync(path)) {
    missing.push(entry.fileName);
    continue;
  }
  if (!isZipBytes(new Uint8Array(await readFile(path)))) missing.push(`${entry.fileName} (invalid)`);
}
console.log(
  JSON.stringify({
    expectedFileCount: expectedFiles.length + 1,
    missingCount: missing.length,
    missing,
  }),
);
if (failed || missing.length > 0) process.exit(1);
