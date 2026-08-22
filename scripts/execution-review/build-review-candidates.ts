#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildReviewCandidates,
  type ComparisonInput,
} from "../../src/execution-review/settlement/review-candidates.ts";
import { checkExclusion } from "../../src/execution-review/exclusions.ts";
import { normalizeAccountName } from "../../src/execution-review/mapping/normalize-account-name.ts";

/**
 * Issue #30: 比較JSONへ状態分類を付け、要説明候補の一覧を生成する。
 * - 分類は #6 の固定ルール（classifyReviewStatus）のみ。
 * - A/B対応だけが needs-explanation の集計対象（比較JSON自体がA/Bのみで構成される）。
 * - 対象外科目も削除せず除外理由付きで保持する。
 * - 出力: data/normalized/execution-review/review-candidates.json
 */

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const COMPARISONS_PATH = "data/normalized/execution-review/budget-comparisons.json";
const OUTPUT_PATH = "data/normalized/execution-review/review-candidates.json";

const comparisonsFile = JSON.parse(await readFile(resolve(ROOT, COMPARISONS_PATH), "utf8")) as {
  records: (ComparisonInput & { sources: unknown })[];
};

function stripCode(value: string): string {
  const index = value.indexOf(":");
  return normalizeAccountName(index >= 0 ? value.slice(index + 1) : value);
}

const rows = buildReviewCandidates(comparisonsFile.records as ComparisonInput[], {
  exclusionLookup: (chapterName, sectionName) => {
    const exclusion = checkExclusion({
      account: "一般会計",
      chapter: chapterName,
      section: sectionName ?? "",
      item: "",
    });
    return { excluded: exclusion.excluded, reasonCode: exclusion.reasonCode };
  },
});

// summary: status別の件数と金額合計
type StatusTotals = { count: number; currentBudgetYen: number; unusedYen: number; fy2026Yen: number };
const byStatus: Record<string, StatusTotals> = {};
for (const row of rows) {
  const totals = (byStatus[row.status] ??= {
    count: 0,
    currentBudgetYen: 0,
    unusedYen: 0,
    fy2026Yen: 0,
  });
  totals.count += 1;
  totals.currentBudgetYen += row.amounts.fy2024CurrentBudgetYen ?? 0;
  totals.unusedYen += row.amounts.fy2024UnusedYen ?? 0;
  totals.fy2026Yen += row.amounts.fy2026InitialBudgetYen ?? 0;
}

await mkdir(dirname(resolve(ROOT, OUTPUT_PATH)), { recursive: true });
const output = {
  fiscalYearPair: [2024, 2026] as const,
  generatedFrom: COMPARISONS_PATH,
  thresholds: rows[0]?.thresholdsUsed ?? null,
  records: rows,
  summary: {
    total: rows.length,
    byStatus: byStatus,
    needsExplanationTop: rows
      .filter((row) => row.status === "needs-explanation")
      .slice(0, 10)
      .map((row) => ({
        key: row.fy2024Keys.map((key) => `${key.chapter}${key.section ? `/${key.section}` : ""}`),
        currentBudgetYen: row.amounts.fy2024CurrentBudgetYen,
        unusedYen: row.amounts.fy2024UnusedYen,
      })),
  },
};
await writeFile(resolve(ROOT, OUTPUT_PATH), `${JSON.stringify(output, null, 1)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      output: OUTPUT_PATH,
      total: output.summary.total,
      byStatus: Object.fromEntries(
        Object.entries(output.summary.byStatus).map(([status, totals]) => [status, totals.count]),
      ),
    },
    null,
    1,
  ),
);
