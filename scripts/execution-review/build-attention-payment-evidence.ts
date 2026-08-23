#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import {
  createAttentionPaymentEvidenceBuilder,
  type AttentionPaymentTxn,
} from "../../src/execution-review/attention-payment-evidence.ts";
import type { ExecutionAttentionItem } from "../../src/execution-review/types.ts";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const ITEMS_PATH = "data/normalized/execution-review/execution-attention-items.json";
const TRANSACTIONS_PATH = "data/normalized/public-expenditure/fy2024/transactions.jsonl";
const OUTPUT_PATH = "data/normalized/execution-review/attention-payment-evidence.json";

const itemsFile = JSON.parse(await readFile(resolve(ROOT, ITEMS_PATH), "utf8")) as { records: ExecutionAttentionItem[] };
const builder = createAttentionPaymentEvidenceBuilder(itemsFile.records);
const reader = createInterface({ input: createReadStream(resolve(ROOT, TRANSACTIONS_PATH), "utf8"), crlfDelay: Infinity });
let transactionLineCount = 0;
for await (const line of reader) {
  if (line.trim().length === 0) continue;
  builder.add(JSON.parse(line) as AttentionPaymentTxn);
  transactionLineCount += 1;
}
const records = builder.finalize();
const output = {
  generatedAt: new Date().toISOString(),
  fiscalYear: 2024 as const,
  generatedFrom: { items: ITEMS_PATH, transactions: TRANSACTIONS_PATH, transactionLineCount },
  metadata: {
    caution: "公金支出情報は正式決算額の代替ではなく、支払件名・節・細節を確認する補助証拠としてのみ使う。",
    matchGranularityOrder: ["item", "section", "chapter", "none"],
  },
  recordCount: records.length,
  records,
  summary: {
    withTransactions: records.filter((record) => record.transactionCount > 0).length,
    withoutTransactions: records.filter((record) => record.transactionCount === 0).length,
    byMatchGranularity: Object.fromEntries(["item", "section", "chapter", "none"].map((level) => [level, records.filter((record) => record.matchGranularity === level).length])),
  },
};
if (records.length !== itemsFile.records.length) throw new Error(`payment evidence count mismatch: ${records.length}/${itemsFile.records.length}`);
await mkdir(dirname(resolve(ROOT, OUTPUT_PATH)), { recursive: true });
await writeFile(resolve(ROOT, OUTPUT_PATH), `${JSON.stringify(output, null, 1)}\n`, "utf8");
console.log(JSON.stringify({ output: OUTPUT_PATH, transactionLineCount, ...output.summary }));
