#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AttentionBureauSummaryRow } from "../../src/execution-review/attention-bureau-summary.ts";
import type { ExecutionAttentionDetail } from "../../src/execution-review/attention-details.ts";
import type { AttentionIndexVerificationView } from "../../src/execution-review/attention-verification.ts";
import { verifyAttentionOutputs } from "../../src/execution-review/attention-verification.ts";
import type { AttentionPaymentEvidence } from "../../src/execution-review/attention-payment-evidence.ts";
import type { ExecutionAttentionItem } from "../../src/execution-review/types.ts";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DIR = "data/normalized/execution-review";

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8")) as T;
}

const scan = await readJson<{ summary: { counts: { leaf?: number } }; records: unknown[] }>(
  `${DIR}/fy2024/execution-scan.json`,
);
const itemsFile = await readJson<{ records: ExecutionAttentionItem[] }>(
  `${DIR}/execution-attention-items.json`,
);
const detailsFile = await readJson<{ records: ExecutionAttentionDetail[] }>(
  `${DIR}/execution-attention-details.json`,
);
const paymentsFile = await readJson<{ records: AttentionPaymentEvidence[] }>(
  `${DIR}/attention-payment-evidence.json`,
);
const bureauFile = await readJson<{ rows: AttentionBureauSummaryRow[] }>(
  `${DIR}/attention-bureau-summary.json`,
);
const indexFile = await readJson<{ attentionItems: AttentionIndexVerificationView | null }>(
  `${DIR}/index.json`,
);
if (indexFile.attentionItems == null) {
  console.error("index.json の attentionItems が null です。新しい全明細生成物を先に生成してください。");
  process.exit(1);
}

const result = verifyAttentionOutputs({
  scanLeafCount: scan.summary.counts.leaf ?? itemsFile.records.length,
  items: itemsFile.records,
  details: detailsFile.records,
  paymentEvidence: paymentsFile.records,
  breakdowns: detailsFile.records.map((detail) => detail.breakdown),
  index: indexFile.attentionItems,
  bureauSummary: bureauFile.rows,
});

if (!result.pass) {
  console.error("verify:execution-attention 失敗:");
  for (const error of result.errors.slice(0, 200)) console.error(`  - ${error}`);
  console.error(JSON.stringify(result.counts));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, ...result.counts }));
