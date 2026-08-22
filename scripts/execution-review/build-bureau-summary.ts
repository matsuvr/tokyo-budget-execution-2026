#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Issue #31: 要説明候補を局別（款単位）に集約したサマリーJSONを生成する。
 * - 入力: review-candidates.json（#30、A/B対応のみで構成される）
 * - 集約キーは2024年度の款（正規化名）。局名変更はmapping側(#27)で管理し、ここでは原文を保持する。
 * - 全局合計が候補全体の集計と一致することを検証する。
 */

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const CANDIDATES_PATH = "data/normalized/execution-review/review-candidates.json";
const OUTPUT_PATH = "data/normalized/execution-review/bureau-summary.json";

interface CandidateRow {
  status: string;
  fy2024Keys: readonly { chapter: string; section?: string }[];
  amounts: {
    fy2024CurrentBudgetYen: number | null;
    fy2024SpentYen: number | null;
    fy2024CarryoverYen: number | null;
    fy2024UnusedYen: number | null;
    fy2026InitialBudgetYen: number | null;
  };
}

const file = JSON.parse(await readFile(resolve(ROOT, CANDIDATES_PATH), "utf8")) as {
  records: CandidateRow[];
};

interface BureauTotals {
  chapter: string;
  comparableCount: number;
  needsExplanationCount: number;
  carryoverCount: number;
  reviewReflectedCount: number;
  executedCount: number;
  incomparableCount: number;
  fy2024CurrentBudgetYen: number;
  fy2024SpentYen: number;
  fy2024CarryoverYen: number;
  fy2024UnusedYen: number;
  fy2026InitialBudgetYen: number;
}

const byBureau = new Map<string, BureauTotals>();
function totalsFor(chapter: string): BureauTotals {
  let totals = byBureau.get(chapter);
  if (totals == null) {
    totals = {
      chapter,
      comparableCount: 0,
      needsExplanationCount: 0,
      carryoverCount: 0,
      reviewReflectedCount: 0,
      executedCount: 0,
      incomparableCount: 0,
      fy2024CurrentBudgetYen: 0,
      fy2024SpentYen: 0,
      fy2024CarryoverYen: 0,
      fy2024UnusedYen: 0,
      fy2026InitialBudgetYen: 0,
    };
    byBureau.set(chapter, totals);
  }
  return totals;
}

let grandTotal = 0n;
for (const row of file.records) {
  const chapterRaw = row.fy2024Keys[0]?.chapter ?? "(不明)";
  const chapterName = chapterRaw.replace(/^[0-9]{1,2}:/u, "").replace(/\s+/gu, "");
  const totals = totalsFor(chapterName);
  totals.comparableCount += 1;
  if (row.status === "needs-explanation") totals.needsExplanationCount += 1;
  else if (row.status === "carryover") totals.carryoverCount += 1;
  else if (row.status === "review-reflected") totals.reviewReflectedCount += 1;
  else if (row.status === "executed") totals.executedCount += 1;
  else if (row.status === "incomparable") totals.incomparableCount += 1;

  // 金額は全statusを通じてA/B集計に含める（C/unmatchedは入力に存在しない）
  totals.fy2024CurrentBudgetYen += row.amounts.fy2024CurrentBudgetYen ?? 0;
  totals.fy2024SpentYen += row.amounts.fy2024SpentYen ?? 0;
  totals.fy2024CarryoverYen += row.amounts.fy2024CarryoverYen ?? 0;
  totals.fy2024UnusedYen += row.amounts.fy2024UnusedYen ?? 0;
  totals.fy2026InitialBudgetYen += row.amounts.fy2026InitialBudgetYen ?? 0;
  grandTotal += BigInt(row.amounts.fy2024CurrentBudgetYen ?? 0);
}

// 出力順序を決定的に: 予算現額の大きい順、同順は款名昇順
const bureaus = [...byBureau.values()].sort(
  (a, b) => b.fy2024CurrentBudgetYen - a.fy2024CurrentBudgetYen || (a.chapter < b.chapter ? -1 : 1),
);

// 全局合計の検証
const sumOfBureaus = bureaus.reduce((sum, b) => sum + BigInt(b.fy2024CurrentBudgetYen), 0n);
if (sumOfBureaus !== grandTotal) {
  console.error(`全局合計が不一致です: ${sumOfBureaus} != ${grandTotal}`);
  process.exit(1);
}

await mkdir(dirname(resolve(ROOT, OUTPUT_PATH)), { recursive: true });
const output = {
  fiscalYearPair: [2024, 2026] as const,
  generatedFrom: CANDIDATES_PATH,
  groupingKey: "2024年度の款（正規化名）",
  metadata: {
    note: [
      "各款は所管する組織・事業の性質が異なるため、局（款）間の金額の直接比較は比較不能とする。",
      "局名変更・組織再編は #27 の対応表（account-mapping-manual.json）で管理し、本ファイルは2024年度の原文表記を保持する。",
      "金額はA/B対応のみで構成される（C/unmatchedは含まない）。",
    ],
  },
  bureaus,
  summary: {
    bureauCount: bureaus.length,
    totalComparableCount: bureaus.reduce((sum, b) => sum + b.comparableCount, 0),
    totalNeedsExplanationCount: bureaus.reduce((sum, b) => sum + b.needsExplanationCount, 0),
    totalCarryoverCount: bureaus.reduce((sum, b) => sum + b.carryoverCount, 0),
    totalReviewReflectedCount: bureaus.reduce((sum, b) => sum + b.reviewReflectedCount, 0),
    totalFy2024CurrentBudgetYen: Number(sumOfBureaus),
    consistencyCheck: sumOfBureaus === grandTotal ? "passed" : "failed",
  },
};
await writeFile(resolve(ROOT, OUTPUT_PATH), `${JSON.stringify(output, null, 1)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      output: OUTPUT_PATH,
      bureauCount: output.summary.bureauCount,
      totalNeedsExplanation: output.summary.totalNeedsExplanationCount,
      consistencyCheck: output.summary.consistencyCheck,
    },
  ),
);
