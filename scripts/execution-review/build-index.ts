#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildExecutionReviewIndex,
} from "../../src/execution-review/review-index.ts";

/**
 * Issue #41: 執行レビューの概要indexを生成する。
 *
 * - 出力: data/normalized/execution-review/index.json
 * - 全体スキャン・候補・局別サマリーの件数を実ファイルから集計し、閾値と注意事項を添える。
 * - policy-review-details.json が存在する場合だけ ready 状態で重点レビューを掲載する。
 *   未生成でも失敗せず pending として出力する。
 * - generatedAt を除き、同じ入力から決定的な出力になる。
 */

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DIR = "data/normalized/execution-review";
const OUTPUT_PATH = `${DIR}/index.json`;

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

interface ScanFile {
  summary: { counts: { total: number; policyReviewTarget: number; policyReviewExcluded: number } };
}
interface ComparisonsFile {
  records: { confidence: string }[];
}
interface CandidatesFile {
  records: { status: string }[];
  thresholds: Record<string, number>;
}
interface MappingsFile {
  summary: Record<string, number>;
}
interface BureauFile {
  summary: {
    bureauCount: number;
    totalComparableCount: number;
    totalNeedsExplanationCount: number;
    totalFy2024CurrentBudgetYen: number;
  };
}
interface DetailsFile {
  records: Parameters<typeof buildExecutionReviewIndex>[0]["policyDetails"] extends null
    ? never
    : NonNullable<Parameters<typeof buildExecutionReviewIndex>[0]["policyDetails"]>["records"];
}

const scan = await readJson(`${DIR}/fy2024/execution-scan.json`) as ScanFile;
const comparisons = await readJson(`${DIR}/budget-comparisons.json`) as ComparisonsFile;
const candidates = await readJson(`${DIR}/review-candidates.json`) as CandidatesFile;
const mappings = await readJson(`${DIR}/account-mappings.json`) as MappingsFile;
const bureau = await readJson(`${DIR}/bureau-summary.json`) as BureauFile;

let details: DetailsFile | null = null;
try {
  details = (await readJson(`${DIR}/policy-review-details.json`)) as DetailsFile;
} catch {
  // 詳細が未生成の場合はpendingとして出力する（失敗させない）
  details = null;
}

const index = buildExecutionReviewIndex({
  scanCounts: scan.summary.counts,
  comparisonRecords: comparisons.records,
  candidateRecords: candidates.records,
  mappingConfidenceSummary: mappings.summary,
  bureauSummary: bureau.summary,
  thresholds: candidates.thresholds,
  policyDetails: details,
});

await mkdir(dirname(resolve(ROOT, OUTPUT_PATH)), { recursive: true });
await writeFile(
  resolve(ROOT, OUTPUT_PATH),
  `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), ...index }, null, 1)}\n`,
  "utf8",
);
console.log(
  JSON.stringify({
    output: OUTPUT_PATH,
    comparableCount: index.comparisons.comparableCount,
    candidateCount: index.reviewCandidates.count,
    policyReviews: index.policyReviews.status,
    featuredReviews: index.policyReviews.featuredReviews.length,
  }),
);
