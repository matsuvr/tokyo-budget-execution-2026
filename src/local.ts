import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import type { ClosingEstimate, PublicExpenditureRecord } from "./types.ts";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));

export async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(join(ROOT, relativePath), "utf8")) as T;
}

export async function loadBudgetSeries(
  key: string,
  year?: 2025 | 2026,
): Promise<Record<string, unknown>> {
  if (!/^[a-z0-9_]+$/u.test(key)) throw new Error(`Invalid budget key: ${key}`);
  const table = await readJson<Record<string, unknown> & { records: Record<string, unknown>[] }>(
    `data/normalized/budget/${key}.json`,
  );
  if (year == null) return table;
  const records = table.records.filter((record) => Number(record["年度"]) === year);
  return { ...table, fiscalYears: [year], recordCount: records.length, records };
}

export async function loadClosingEstimate(): Promise<ClosingEstimate> {
  return readJson<ClosingEstimate>("data/normalized/closing-estimate/fy2025.json");
}

export async function* streamPublicExpenditure(
  fiscalYear: 2025 | 2026,
): AsyncGenerator<PublicExpenditureRecord> {
  const path = join(
    ROOT,
    "data",
    "normalized",
    "public-expenditure",
    `fy${fiscalYear}`,
    "transactions.jsonl",
  );
  const reader = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of reader) {
    if (line.trim()) yield JSON.parse(line) as PublicExpenditureRecord;
  }
}
