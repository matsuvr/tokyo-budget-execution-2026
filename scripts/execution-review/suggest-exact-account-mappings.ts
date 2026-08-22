#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeAccountName } from "../../src/execution-review/mapping/normalize-account-name.ts";

/**
 * Issue #25: 2024・2026予算科目の完全一致候補を生成する。
 * - 正規化後の款名・項名がすべて一致する組だけを exact 候補とする。
 * - 類似度・部分一致・LLMは使わない。正規化前後の名称を両方保持する。
 * - 一対多・多対一は conflict として分離し、自動確定しない。
 * - 自動候補に信頼度Aは付けない（status: "candidate"）。
 */

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const SOURCES = {
  fy2024: "data/normalized/execution-review/fy2024/initial-budget-lines.json",
  fy2026: "data/normalized/execution-review/fy2026/initial-budget-lines.json",
} as const;
const OUTPUT_PATH = "data/generated/execution-review/account-mapping-suggestions.json";

interface BudgetLine {
  fiscalYear: number;
  chapter: string;
  section: string | null;
  level: "kan" | "kou";
  initialBudgetYen: number;
  sourceFile: string;
  sourcePage: number | null;
}

interface SideRef {
  fiscalYear: 2024 | 2026;
  chapterRaw: string;
  sectionRaw: string | null;
  chapterNormalized: string;
  sectionNormalized: string | null;
  initialBudgetYen: number;
  sourceFile: string;
}

function toSideRef(fiscalYear: 2024 | 2026, line: BudgetLine): SideRef {
  return {
    fiscalYear,
    chapterRaw: line.chapter,
    sectionRaw: line.section,
    chapterNormalized: normalizeAccountName(line.chapter.replace(/^[0-9]{1,2}:/u, "")),
    sectionNormalized:
      line.section != null
        ? normalizeAccountName(line.section.replace(/^[0-9]{1,2}:/u, ""))
        : null,
    initialBudgetYen: line.initialBudgetYen,
    sourceFile: line.sourceFile,
  };
}

const fy2024File = JSON.parse(await readFile(resolve(ROOT, SOURCES.fy2024), "utf8")) as {
  records: BudgetLine[];
};
const fy2026File = JSON.parse(await readFile(resolve(ROOT, SOURCES.fy2026), "utf8")) as {
  records: BudgetLine[];
};

const fy2024Kan = fy2024File.records
  .filter((line) => line.level === "kan")
  .map((line) => toSideRef(2024, line));
const fy2026Kan = fy2026File.records
  .filter((line) => line.level === "kan")
  .map((line) => toSideRef(2026, line));
const fy2024Kou = fy2024File.records
  .filter((line) => line.level === "kou" && line.section != null)
  .map((line) => toSideRef(2024, line));
const fy2026Kou = fy2026File.records
  .filter((line) => line.level === "kou" && line.section != null)
  .map((line) => toSideRef(2026, line));

function groupBy<T>(values: readonly T[], keyOf: (value: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const value of values) {
    const key = keyOf(value);
    const list = map.get(key) ?? [];
    list.push(value);
    map.set(key, list);
  }
  return map;
}

interface CandidatePair {
  status: "candidate" | "conflict";
  granularity: "chapter" | "item";
  fy2024?: SideRef[];
  fy2026?: SideRef[];
  reason?: string;
}

const chapterGroups = groupBy([...fy2024Kan, ...fy2026Kan], (ref) => ref.chapterNormalized);
const itemGroups = groupBy([...fy2024Kou, ...fy2026Kou], (ref) =>
  `${ref.chapterNormalized}|${ref.sectionNormalized ?? ""}`,
);

const candidates: CandidatePair[] = [];
const conflicts: CandidatePair[] = [];

for (const [key, group] of chapterGroups) {
  const fy2024 = group.filter((ref) => ref.fiscalYear === 2024);
  const fy2026 = group.filter((ref) => ref.fiscalYear === 2026);
  if (fy2024.length === 1 && fy2026.length === 1) {
    candidates.push({ status: "candidate", granularity: "chapter", fy2024, fy2026 });
  } else if (fy2024.length > 0 && fy2026.length > 0) {
    conflicts.push({
      status: "conflict",
      granularity: "chapter",
      fy2024,
      fy2026,
      reason: `one-to-many or many-to-one (${fy2024.length}:${fy2026.length})`,
    });
  }
  void key;
}

for (const [, group] of itemGroups) {
  const fy2024 = group.filter((ref) => ref.fiscalYear === 2024);
  const fy2026 = group.filter((ref) => ref.fiscalYear === 2026);
  if (fy2024.length === 1 && fy2026.length === 1) {
    candidates.push({ status: "candidate", granularity: "item", fy2024, fy2026 });
  } else if (fy2024.length > 0 && fy2026.length > 0) {
    conflicts.push({
      status: "conflict",
      granularity: "item",
      fy2024,
      fy2026,
      reason: `one-to-many or many-to-one (${fy2024.length}:${fy2026.length})`,
    });
  }
}

// unmatched: どのグループにも相手がいない行
const matchedFy2024 = new Set(
  [...candidates, ...conflicts].flatMap((entry) => entry.fy2024 ?? []),
);
const matchedFy2026 = new Set(
  [...candidates, ...conflicts].flatMap((entry) => entry.fy2026 ?? []),
);
const unmatched = {
  fy2024: [...fy2024Kan, ...fy2024Kou].filter((ref) => !matchedFy2024.has(ref)),
  fy2026: [...fy2026Kan, ...fy2026Kou].filter((ref) => !matchedFy2026.has(ref)),
};

await mkdir(dirname(resolve(ROOT, OUTPUT_PATH)), { recursive: true });
const output = {
  version: 1,
  generatedFrom: SOURCES,
  normalization: "whitespace removal + parenthetical removal + full-width alnum folding",
  note: "自動候補は人手確認前の状態であり信頼度Aを持たない。A確定は #26 の手順で行う。",
  candidates,
  conflicts,
  unmatched,
  summary: {
    exactCandidates: candidates.length,
    conflictCount: conflicts.length,
    unmatchedFy2024: unmatched.fy2024.length,
    unmatchedFy2026: unmatched.fy2026.length,
    chapterCandidates: candidates.filter((entry) => entry.granularity === "chapter").length,
    itemCandidates: candidates.filter((entry) => entry.granularity === "item").length,
  },
};
await writeFile(resolve(ROOT, OUTPUT_PATH), `${JSON.stringify(output, null, 1)}\n`, "utf8");

console.log(JSON.stringify(output.summary));
