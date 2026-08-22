#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateAndMergeMappings,
  type MappableMappingRecord,
  type MappingAccountKeyRef,
} from "../../src/execution-review/mapping/validate-mappings.ts";

/**
 * Issue #28: A/B対応表を統合・検証するvalidator。
 * - #26のexact対応表と#27のmanual対応表を読み込み、統合して
 *   data/normalized/execution-review/account-mappings.json を生成する。
 * - 重複ID・参照切れ・信頼度違反・矛盾割当を検出し、違反時は非0で終了する。
 */

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const EXACT_PATH = "data/manual/execution-review/account-mapping-exact.json";
const MANUAL_PATH = "data/manual/execution-review/account-mapping-manual.json";
const FY2024_LINES = "data/normalized/execution-review/fy2024/initial-budget-lines.json";
const FY2026_LINES = "data/normalized/execution-review/fy2026/initial-budget-lines.json";
const OUTPUT_PATH = "data/normalized/execution-review/account-mappings.json";

const exactFile = JSON.parse(await readFile(resolve(ROOT, EXACT_PATH), "utf8")) as {
  mappings: {
    mappingId: string;
    granularity: "chapter" | "item";
    relationType: string;
    fy2024: { chapterRaw: string; sectionRaw: string | null; initialBudgetYen: number };
    fy2026: { chapterRaw: string; sectionRaw: string | null; sourceFile: string };
  }[];
};
const manualFile = JSON.parse(await readFile(resolve(ROOT, MANUAL_PATH), "utf8")) as {
  mappings: MappableMappingRecord[];
};

function keyRef(chapterRaw: string, sectionRaw: string | null): MappingAccountKeyRef {
  return {
    account: "一般会計",
    chapter: chapterRaw,
    ...(sectionRaw != null ? { section: sectionRaw } : {}),
  };
}

const mergedRecords: MappableMappingRecord[] = [
  ...exactFile.mappings.map((mapping) => ({
    mappingId: mapping.mappingId,
    fiscalYear2024: [keyRef(mapping.fy2024.chapterRaw, mapping.fy2024.sectionRaw)],
    fiscalYear2026: [keyRef(mapping.fy2026.chapterRaw, mapping.fy2026.sectionRaw)],
    granularity: mapping.granularity,
    confidence: "A" as const,
    relationType: mapping.relationType,
    evidence: {
      title: "令和6年度予算概要 × 決算明細書 × 議案第1号 突合",
      url: "https://www.zaimu1.metro.tokyo.lg.jp/zaisei/yosan/8tousyogian.pdf",
      page: null as number | null,
    },
    note: "#26で独立原本突合により確認",
  })),
  ...manualFile.mappings,
];

// 実在キー索引の構築（正規化名）
async function buildIndex(
  path: string,
): Promise<Map<string, Set<string>>> {
  const file = JSON.parse(await readFile(resolve(ROOT, path), "utf8")) as {
    records: { chapter: string; section: string | null; level?: string; initialBudgetYen: number }[];
  };
  const index = new Map<string, Set<string>>();
  const { normalizeAccountName } = await import(
    "../../src/execution-review/mapping/normalize-account-name.ts"
  );
  const add = (key: string, amount: number): void => {
    const set = index.get(key) ?? new Set<string>();
    set.add(String(amount));
    index.set(key, set);
  };
  for (const line of file.records) {
    const chapter = normalizeAccountName(line.chapter.replace(/^[0-9]{1,2}:/u, ""));
    if (line.level === "kan") {
      add(chapter, line.initialBudgetYen);
    } else if (line.section != null) {
      add(
        `${chapter}|${normalizeAccountName(line.section.replace(/^[0-9]{1,2}:/u, ""))}`,
        line.initialBudgetYen,
      );
    }
  }
  return index;
}

const existingKeys = {
  fy2024: await buildIndex(FY2024_LINES),
  fy2026: await buildIndex(FY2026_LINES),
};

const result = validateAndMergeMappings(mergedRecords, existingKeys);

await mkdir(dirname(resolve(ROOT, OUTPUT_PATH)), { recursive: true });
await writeFile(
  resolve(ROOT, OUTPUT_PATH),
  `${JSON.stringify({ records: result.records, summary: result.summary }, null, 1)}\n`,
  "utf8",
);

for (const issue of result.issues) {
  console.error(`VIOLATION\t${issue.code}\t${issue.mappingId}\t${issue.detail}`);
}
console.log(JSON.stringify({ summary: result.summary, issueCount: result.issues.length }));

if (result.issues.length > 0) process.exit(1);
