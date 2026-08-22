#!/usr/bin/env node
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  toExecutionRecord,
  type ExecutionRecordRow,
  type IntermediateRow,
} from "../../src/execution-review/settlement/to-execution-record.ts";

/**
 * Issue #19: 中間行JSONLを型付き執行実績JSONへ変換する。
 * - settlement-rows.jsonl をストリーム読込する（全量をメモリへ保持しない）。
 * - 金額は円整数へ変換し、欠損・解析不能を0へ変換しない。
 * - 同一安定キーの重複を検出し、黙って上書きしない。
 * - 出力: data/normalized/execution-review/fy2024/execution-records.json
 */

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const INPUT_PATH = "data/normalized/execution-review/fy2024/settlement-rows.jsonl";
const OUTPUT_PATH = "data/normalized/execution-review/fy2024/execution-records.json";

const records: ExecutionRecordRow[] = [];
const seenKeys = new Map<string, number>();
const errors: { rowIndex: number; pageNumber: number; stableKey?: string | null; reason: string }[] = [];
let targetRecords = 0;
let skippedRecords = 0;
let duplicateCount = 0;

const rl = createInterface({
  input: createReadStream(resolve(ROOT, INPUT_PATH), "utf8"),
  crlfDelay: Infinity,
});

for await (const line of rl) {
  if (line.trim().length === 0) continue;
  const row = JSON.parse(line) as IntermediateRow;
  targetRecords += 1;
  const result = toExecutionRecord(row);
  if (result.status === "skip") {
    skippedRecords += 1;
    continue;
  }
  if (result.status === "error") {
    errors.push({
      rowIndex: row.rowIndex,
      pageNumber: row.pageNumber,
      stableKey: row.stableKey ?? undefined,
      reason: result.reason,
    });
    continue;
  }
  // 同一安定キーの重複検出（rowKindが違えば小計として併存を許容する）。
  const dedupeKey = `${result.record.accountKey.key}#${result.rowKind}`;
  const previous = seenKeys.get(dedupeKey);
  if (previous != null) {
    duplicateCount += 1;
    errors.push({
      rowIndex: row.rowIndex,
      pageNumber: row.pageNumber,
      stableKey: result.record.accountKey.key,
      reason: `duplicate-of-rowIndex-${previous}`,
    });
    continue;
  }
  seenKeys.set(dedupeKey, row.rowIndex);
  records.push(result.record);
}

await mkdir(dirname(resolve(ROOT, OUTPUT_PATH)), { recursive: true });
const output = {
  fiscalYear: 2024,
  generatedFrom: INPUT_PATH,
  unit: "円",
  records,
  errors,
  summary: {
    targetRecords,
    emittedRecords: records.length,
    skippedRecords,
    errorCount: errors.length,
    duplicateCount,
    hierarchyRecords: records.filter((record) => record.rowKind === "hierarchy").length,
    subtotalRecords: records.filter((record) => record.rowKind === "subtotal").length,
  },
};
await writeFile(resolve(ROOT, OUTPUT_PATH), `${JSON.stringify(output, null, 1)}\n`, "utf8");

console.log(
  JSON.stringify({
    output: OUTPUT_PATH,
    ...output.summary,
  }),
);
