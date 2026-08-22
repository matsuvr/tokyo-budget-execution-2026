#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildComparison,
  buildIndexes,
  type BudgetComparisonRecord,
} from "../../src/execution-review/mapping/build-comparisons.ts";

/**
 * Issue #29: 検証済み対応表を使い、2024年度の執行実績と2026年度当初予算を
 * 同じ比較レコードへまとめる。
 * - A/B対応（aggregatable）だけを金額比較対象とする。C/unmatchedは合算しない。
 * - split/mergedは共通粒度の単純合計のみ。按分は行わない。
 * - 出力: data/normalized/execution-review/budget-comparisons.json
 */

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const MAPPINGS_PATH = "data/normalized/execution-review/account-mappings.json";
const RECORDS_PATH = "data/normalized/execution-review/fy2024/execution-records.json";
const FY2024_LINES = "data/normalized/execution-review/fy2024/initial-budget-lines.json";
const FY2026_LINES = "data/normalized/execution-review/fy2026/initial-budget-lines.json";
const OUTPUT_PATH = "data/normalized/execution-review/budget-comparisons.json";

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8")) as T;
}

const mappingsFile = await readJson<{
  records: {
    mappingId: string;
    confidence: "A" | "B" | "C" | "unmatched";
    relationType: string;
    granularity: string;
    aggregatable: boolean;
    fiscalYear2024: { account: string; chapter: string; section?: string }[];
    fiscalYear2026: { account: string; chapter: string; section?: string }[];
  }[];
}>(MAPPINGS_PATH);
const recordsFile = await readJson<{
  records: {
    kind: string;
    accountKey: { chapter: string; section: string };
    currentBudgetYen: number;
    spentYen: number;
    carryoverYen: number;
    unusedYen: number;
    initialBudgetYen: number | null;
    sourcePage: number;
  }[];
}>(RECORDS_PATH);
const fy2024Lines = await readJson<{
  records: { level: string; chapter: string; section: string | null; initialBudgetYen: number | null; sourcePage: number | null }[];
}>(FY2024_LINES);
const fy2026Lines = await readJson<{
  records: { level: string; chapter: string; section: string | null; initialBudgetYen: number | null; sourcePage: number | null }[];
}>(FY2026_LINES);

const index = buildIndexes(recordsFile.records, fy2024Lines.records, fy2026Lines.records);

// A/B対応のみ処理する（C/unmatchedの金額は合算しない）
const aggregatable = mappingsFile.records.filter((record) => record.aggregatable);
const comparisons: BudgetComparisonRecord[] = [];
for (let sequence = 0; sequence < aggregatable.length; sequence += 1) {
  const mapping = aggregatable[sequence];
  const record = buildComparison(
    mapping.mappingId,
    {
      confidence: mapping.confidence as "A" | "B",
      relationType: mapping.relationType,
      granularity: mapping.granularity,
      fy2024Keys: mapping.fiscalYear2024,
      fy2026Keys: mapping.fiscalYear2026,
    },
    index,
    sequence + 1,
  );
  if (record != null) comparisons.push(record);
}

// 出力順序を決定的に: 安定キー昇順
comparisons.sort((a, b) =>
  a.fy2024Keys[0].chapter < b.fy2024Keys[0].chapter
    ? -1
    : a.fy2024Keys[0].chapter > b.fy2024Keys[0].chapter
      ? 1
      : a.comparisonId < b.comparisonId
        ? -1
        : 1,
);

await mkdir(dirname(resolve(ROOT, OUTPUT_PATH)), { recursive: true });
const output = {
  fiscalYearPair: [2024, 2026] as const,
  unit: "円",
  generatedFrom: {
    mappings: MAPPINGS_PATH,
    settlement: RECORDS_PATH,
    fy2024InitialBudget: FY2024_LINES,
    fy2026InitialBudget: FY2026_LINES,
  },
  records: comparisons,
  summary: {
    mappingCount: mappingsFile.records.length,
    aggregatableMappings: aggregatable.length,
    comparisonCount: comparisons.length,
    skippedNonAggregatable: mappingsFile.records.filter((record) => !record.aggregatable).length,
    byGranularity: {
      chapter: comparisons.filter((record) => record.granularity === "chapter").length,
      item: comparisons.filter((record) => record.granularity === "item").length,
    },
  },
};
await writeFile(resolve(ROOT, OUTPUT_PATH), `${JSON.stringify(output, null, 1)}\n`, "utf8");

console.log(JSON.stringify(output.summary));
