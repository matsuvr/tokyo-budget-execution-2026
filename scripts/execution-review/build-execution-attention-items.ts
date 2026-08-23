#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  attachBudgetComparisons,
  buildExecutionAttentionItems,
  type BudgetComparisonInput,
  type JoinDiagnostic,
} from "../../src/execution-review/attention-items.ts";
import type { ScanRecord } from "../../src/execution-review/settlement/execution-scan.ts";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const SCAN_PATH = "data/normalized/execution-review/fy2024/execution-scan.json";
const COMPARISONS_PATH = "data/normalized/execution-review/budget-comparisons.json";
const OUTPUT_PATH = "data/normalized/execution-review/execution-attention-items.json";

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8")) as T;
}

const scan = await readJson<{ records: ScanRecord[] }>(SCAN_PATH);
const comparisons = await readJson<{ records: BudgetComparisonInput[] }>(COMPARISONS_PATH);
const diagnostics: JoinDiagnostic[] = [];
const leafItems = buildExecutionAttentionItems(scan.records);
const records = attachBudgetComparisons(leafItems, comparisons.records, (diagnostic) => diagnostics.push(diagnostic));
for (const diagnostic of diagnostics.slice(0, 20)) console.error(JSON.stringify(diagnostic));

const scopeCounts = {
  operational: records.filter((record) => record.reviewScope === "operational").length,
  "reference-only": records.filter((record) => record.reviewScope === "reference-only").length,
  uncertain: records.filter((record) => record.reviewScope === "uncertain").length,
};
const comparisonAttachedCount = records.filter((record) => record.comparison != null).length;
const output = {
  generatedAt: new Date().toISOString(),
  fiscalYear: 2024 as const,
  generatedFrom: { scan: SCAN_PATH, comparisons: COMPARISONS_PATH },
  sourceRecordCount: scan.records.length,
  recordCount: records.length,
  comparisonAttachedCount,
  comparisonUnavailableCount: records.length - comparisonAttachedCount,
  ambiguousComparisonCount: diagnostics.length,
  scopeCounts,
  records,
};
await mkdir(dirname(resolve(ROOT, OUTPUT_PATH)), { recursive: true });
await writeFile(resolve(ROOT, OUTPUT_PATH), `${JSON.stringify(output, null, 1)}\n`, "utf8");
console.log(JSON.stringify({ output: OUTPUT_PATH, recordCount: records.length, comparisonAttachedCount, ambiguousComparisonCount: diagnostics.length, scopeCounts }));
