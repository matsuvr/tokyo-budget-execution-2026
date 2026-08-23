#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAttentionBreakdowns, type ComparisonAmountsForBreakdown } from "../../src/execution-review/attention-breakdown.ts";
import { buildExecutionAttentionDetails, type PolicyReviewDetailLike } from "../../src/execution-review/attention-details.ts";
import type { AttentionPaymentEvidence } from "../../src/execution-review/attention-payment-evidence.ts";
import type { ScanRecord } from "../../src/execution-review/settlement/execution-scan.ts";
import type { ExecutionAttentionItem } from "../../src/execution-review/types.ts";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const ITEMS_PATH = "data/normalized/execution-review/execution-attention-items.json";
const SCAN_PATH = "data/normalized/execution-review/fy2024/execution-scan.json";
const COMPARISONS_PATH = "data/normalized/execution-review/budget-comparisons.json";
const PAYMENTS_PATH = "data/normalized/execution-review/attention-payment-evidence.json";
const POLICY_PATH = "data/normalized/execution-review/policy-review-details.json";
const OUTPUT_PATH = "data/normalized/execution-review/execution-attention-details.json";

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8")) as T;
}
const items = await readJson<{ records: ExecutionAttentionItem[] }>(ITEMS_PATH);
const scan = await readJson<{ records: ScanRecord[] }>(SCAN_PATH);
const comparisons = await readJson<{ records: ComparisonAmountsForBreakdown[] }>(COMPARISONS_PATH);
const payments = await readJson<{ records: AttentionPaymentEvidence[] }>(PAYMENTS_PATH);
let policyRecords: PolicyReviewDetailLike[] = [];
try {
  policyRecords = (await readJson<{ records: PolicyReviewDetailLike[] }>(POLICY_PATH)).records;
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const breakdowns = buildAttentionBreakdowns(items.records, scan.records, comparisons.records);
const records = buildExecutionAttentionDetails({
  items: items.records,
  breakdowns,
  paymentEvidence: payments.records,
  policyReviewDetails: policyRecords,
});
const output = {
  generatedAt: new Date().toISOString(),
  fiscalYear: 2024 as const,
  generatedFrom: { items: ITEMS_PATH, scan: SCAN_PATH, comparisons: COMPARISONS_PATH, payments: PAYMENTS_PATH, policyReviews: POLICY_PATH },
  recordCount: records.length,
  records,
  summary: {
    officialExplanationStatus: Object.fromEntries(["confirmed", "not-found", "not-reviewed", "not-applicable"].map((status) => [status, records.filter((record) => record.officialExplanation.status === status).length])),
    breakdownMismatchCount: records.filter((record) => record.breakdown.reconciliation === "mismatch").length,
  },
};
await mkdir(dirname(resolve(ROOT, OUTPUT_PATH)), { recursive: true });
await writeFile(resolve(ROOT, OUTPUT_PATH), `${JSON.stringify(output, null, 1)}\n`, "utf8");
console.log(JSON.stringify({ output: OUTPUT_PATH, recordCount: records.length, ...output.summary }));
