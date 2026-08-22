#!/usr/bin/env node
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPaymentEvidenceCollector,
  type PaymentEvidence,
  type PaymentTxn,
} from "../../src/execution-review/mapping/payment-evidence.ts";

/**
 * Issue #33: 比較候補ごとに支払件名上位を補助証拠として集計する。
 * - transactions.jsonl（fy2024）をストリーム読込する。
 * - A/B対応表の比較粒度に従い、会計・款・項が一致する支払だけを候補へ接続する。
 * - 支払額は2024決算の支出済額へ上書きしない（補助証拠として別出力）。
 * - 出力: data/normalized/execution-review/payment-evidence.json
 */

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const COMPARISONS_PATH = "data/normalized/execution-review/budget-comparisons.json";
const TRANSACTIONS_PATH = "data/normalized/public-expenditure/fy2024/transactions.jsonl";
const OUTPUT_PATH = "data/normalized/execution-review/payment-evidence.json";

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8")) as T;
}

const comparisonsFile = await readJson<{
  records: {
    comparisonId: string;
    mappingId: string;
    confidence: string;
    relationType: string;
    granularity: string;
    fy2024Keys: { account: string; chapter: string; section?: string }[];
  }[];
}>(COMPARISONS_PATH);

// A/B対応のみ（budget-comparisons は既に A/B のみで構成される）
const collectors = comparisonsFile.records.map((record) =>
  createPaymentEvidenceCollector({
    comparisonId: record.comparisonId,
    mappingId: record.mappingId,
    confidence: record.confidence,
    relationType: record.relationType,
    granularity: record.granularity,
    keys: record.fy2024Keys,
  }),
);

const rl = createInterface({
  input: createReadStream(resolve(ROOT, TRANSACTIONS_PATH), "utf8"),
  crlfDelay: Infinity,
});

let processedLines = 0;
for await (const line of rl) {
  if (line.trim().length === 0) continue;
  const txn = JSON.parse(line) as PaymentTxn;
  for (const collector of collectors) collector.add(txn);
  processedLines += 1;
}

const evidences: PaymentEvidence[] = collectors
  .map((collector) => collector.finalize())
  .sort((a, b) => (a.comparisonId < b.comparisonId ? -1 : a.comparisonId > b.comparisonId ? 1 : 0));

await mkdir(dirname(resolve(ROOT, OUTPUT_PATH)), { recursive: true });
const output = {
  fiscalYearPair: [2024, 2026] as const,
  generatedFrom: {
    comparisons: COMPARISONS_PATH,
    transactions: TRANSACTIONS_PATH,
    transactionLineCount: processedLines,
  },
  metadata: {
    caution:
      "公金支出情報は正式決算額と一致するとは限らず、執行率計算には使わない。支払件名・金額は補助証拠である。",
    paymentNameLimit: 10,
    expenseBreakdownLimit: null,
    description:
      "支払件名は原文を保持する。通常月と出納整理期間（isClosingPeriod=true）の金額は別集計。",
  },
  candidates: evidences,
  summary: {
    candidateCount: evidences.length,
    withTransactions: evidences.filter((entry) => entry.transactionCount > 0).length,
    withoutTransactions: evidences.filter((entry) => entry.transactionCount === 0).length,
    totalMatchedAmountYen: evidences.reduce((sum, entry) => sum + entry.totalAmountYen, 0),
  },
};
await writeFile(resolve(ROOT, OUTPUT_PATH), `${JSON.stringify(output, null, 1)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      output: OUTPUT_PATH,
      ...output.summary,
      transactionLineCount: processedLines,
    },
    null,
    1,
  ),
);
