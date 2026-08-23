#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RATE_RANKING_MIN_BUDGET_YEN,
  RANKING_LIMIT,
  buildScanRecord,
  isLeafExecutionRecord,
  rankScanRecords,
  type ScanRecord,
} from "../../src/execution-review/settlement/execution-scan.ts";
import type { ExecutionRecord } from "../../src/execution-review/types.ts";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const INPUT_PATH = "data/normalized/execution-review/fy2024/execution-records.json";
const VERIFICATION_PATH = "data/normalized/execution-review/fy2024/verification.json";
const OUTPUT_PATH = "data/normalized/execution-review/fy2024/execution-scan.json";

const verification = JSON.parse(await readFile(resolve(ROOT, VERIFICATION_PATH), "utf8")) as { pass: boolean };
if (!verification.pass) {
  console.error("verification.json の pass が false です。決算検証を先に通してください。");
  process.exit(1);
}

const inputFile = JSON.parse(await readFile(resolve(ROOT, INPUT_PATH), "utf8")) as { records: ExecutionRecord[] };
const scanRecords: ScanRecord[] = inputFile.records.map(buildScanRecord);
const leafRecords = scanRecords.filter(isLeafExecutionRecord);
const scopeCounts = {
  operational: leafRecords.filter((record) => record.reviewScope.scope === "operational").length,
  "reference-only": leafRecords.filter((record) => record.reviewScope.scope === "reference-only").length,
  uncertain: leafRecords.filter((record) => record.reviewScope.scope === "uncertain").length,
};

const scan = {
  fiscalYear: 2024 as const,
  generatedFrom: INPUT_PATH,
  criteria: {
    rateRankingMinBudgetYen: RATE_RANKING_MIN_BUDGET_YEN,
    rankingLimit: RANKING_LIMIT,
    rankingTieBreak: "value desc, then stable key asc",
    rankingTargetLevel: "item",
    primaryMetric: "yearEndUnexecutedYen = carryoverYen + unusedYen",
  },
  records: scanRecords,
  summary: {
    counts: {
      total: scanRecords.length,
      leaf: leafRecords.length,
      byReviewScope: scopeCounts,
      policyReviewTarget: scanRecords.filter((record) => !record.policyReview.excluded).length,
      policyReviewExcluded: scanRecords.filter((record) => record.policyReview.excluded).length,
    },
    rankings: {
      yearEndUnexecutedAmountTop: rankScanRecords(leafRecords, { field: "yearEndUnexecutedAmount" }),
      yearEndUnexecutedRateTop: rankScanRecords(leafRecords, {
        field: "yearEndUnexecutedRate",
        minBudgetYen: RATE_RANKING_MIN_BUDGET_YEN,
      }),
      unusedAmountTop: rankScanRecords(leafRecords, { field: "unusedAmount" }),
      unusedRateTop: rankScanRecords(leafRecords, { field: "unusedRate", minBudgetYen: RATE_RANKING_MIN_BUDGET_YEN }),
      carryoverAmountTop: rankScanRecords(leafRecords, { field: "carryoverAmount" }),
      carryoverRateTop: rankScanRecords(leafRecords, { field: "carryoverRate", minBudgetYen: RATE_RANKING_MIN_BUDGET_YEN }),
    },
  },
};

await mkdir(dirname(resolve(ROOT, OUTPUT_PATH)), { recursive: true });
await writeFile(resolve(ROOT, OUTPUT_PATH), `${JSON.stringify(scan, null, 1)}\n`, "utf8");
console.log(JSON.stringify({ output: OUTPUT_PATH, records: scan.records.length, leafRecords: leafRecords.length, scopeCounts }));
