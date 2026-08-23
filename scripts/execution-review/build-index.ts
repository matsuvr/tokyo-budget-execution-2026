#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAttentionIndex } from "../../src/execution-review/attention-index.ts";
import { buildExecutionReviewIndex } from "../../src/execution-review/review-index.ts";
import type { ExecutionAttentionItem } from "../../src/execution-review/types.ts";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DIR = "data/normalized/execution-review";
const OUTPUT_PATH = `${DIR}/index.json`;

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8")) as T;
}

async function readOptionalJson<T>(path: string): Promise<T | null> {
  try {
    return await readJson<T>(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

interface ScanFile {
  summary: {
    counts: {
      total: number;
      leaf?: number;
      policyReviewTarget: number;
      policyReviewExcluded: number;
    };
  };
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
  records: NonNullable<Parameters<typeof buildExecutionReviewIndex>[0]["policyDetails"]>["records"];
}

const scan = await readJson<ScanFile>(`${DIR}/fy2024/execution-scan.json`);
const comparisons = await readJson<ComparisonsFile>(`${DIR}/budget-comparisons.json`);
const candidates = await readJson<CandidatesFile>(`${DIR}/review-candidates.json`);
const mappings = await readJson<MappingsFile>(`${DIR}/account-mappings.json`);
const bureau = await readJson<BureauFile>(`${DIR}/bureau-summary.json`);
const details = await readOptionalJson<DetailsFile>(`${DIR}/policy-review-details.json`);

const legacyIndex = buildExecutionReviewIndex({
  scanCounts: scan.summary.counts,
  comparisonRecords: comparisons.records,
  candidateRecords: candidates.records,
  mappingConfidenceSummary: mappings.summary,
  bureauSummary: bureau.summary,
  thresholds: candidates.thresholds,
  policyDetails: details,
});

const attentionItems = await readOptionalJson<{ records: ExecutionAttentionItem[] }>(
  `${DIR}/execution-attention-items.json`,
);
const attentionDetails = await readOptionalJson<{ records: unknown[] }>(
  `${DIR}/execution-attention-details.json`,
);
if ((attentionItems == null) !== (attentionDetails == null)) {
  throw new Error("execution attention items/details must either both exist or both be absent");
}
const attentionIndex =
  attentionItems == null || attentionDetails == null
    ? null
    : buildAttentionIndex(attentionItems.records, attentionDetails.records.length);

const index = {
  version: 2,
  generatedAt: new Date().toISOString(),
  ...legacyIndex,
  attentionItems: attentionIndex,
};

await mkdir(dirname(resolve(ROOT, OUTPUT_PATH)), { recursive: true });
await writeFile(resolve(ROOT, OUTPUT_PATH), `${JSON.stringify(index, null, 1)}\n`, "utf8");
console.log(
  JSON.stringify({
    output: OUTPUT_PATH,
    comparableCount: legacyIndex.comparisons.comparableCount,
    legacyCandidateCount: legacyIndex.reviewCandidates.count,
    attentionRecordCount: attentionIndex?.recordCount ?? 0,
    attentionStatus: attentionIndex == null ? "pending" : "ready",
  }),
);
