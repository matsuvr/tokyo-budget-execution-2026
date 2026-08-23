#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAttentionBureauSummary } from "../../src/execution-review/attention-bureau-summary.ts";
import type { ExecutionAttentionItem } from "../../src/execution-review/types.ts";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const ITEMS_PATH = "data/normalized/execution-review/execution-attention-items.json";
const OUTPUT_PATH = "data/normalized/execution-review/attention-bureau-summary.json";
const input = JSON.parse(await readFile(resolve(ROOT, ITEMS_PATH), "utf8")) as { records: ExecutionAttentionItem[] };
const rows = buildAttentionBureauSummary(input.records);
const output = {
  generatedAt: new Date().toISOString(),
  fiscalYear: 2024 as const,
  generatedFrom: ITEMS_PATH,
  rowCount: rows.length,
  rows,
  summary: {
    itemCount: input.records.length,
    scopeRowCounts: Object.fromEntries(["operational", "reference-only", "uncertain"].map((scope) => [scope, rows.filter((row) => row.scope === scope).length])),
  },
};
await mkdir(dirname(resolve(ROOT, OUTPUT_PATH)), { recursive: true });
await writeFile(resolve(ROOT, OUTPUT_PATH), `${JSON.stringify(output, null, 1)}\n`, "utf8");
console.log(JSON.stringify({ output: OUTPUT_PATH, ...output.summary }));
