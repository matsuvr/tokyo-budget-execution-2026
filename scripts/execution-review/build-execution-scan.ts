#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RATE_RANKING_MIN_BUDGET_YEN,
  RANKING_LIMIT,
  buildScanRecord,
  rankScanRecords,
  type ScanRecord,
} from "../../src/execution-review/settlement/execution-scan.ts";
import type { ExecutionRecord } from "../../src/execution-review/types.ts";

/**
 * Issue #21: 2024年度一般会計の執行スキャンJSONを生成する。
 * - 入力: 検証済み execution-records.json（#20の検証を通過していること）
 * - 出力: data/normalized/execution-review/fy2024/execution-scan.json
 * - 各明細に執行率・繰越率・不用率と対象外フラグを付与する。
 * - ランキングは対象外行を除き、同順位は安定キー昇順で固定する。
 */

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const INPUT_PATH = "data/normalized/execution-review/fy2024/execution-records.json";
const VERIFICATION_PATH = "data/normalized/execution-review/fy2024/verification.json";
const OUTPUT_PATH = "data/normalized/execution-review/fy2024/execution-scan.json";

const verification = JSON.parse(
  await readFile(resolve(ROOT, VERIFICATION_PATH), "utf8"),
) as { pass: boolean };
if (!verification.pass) {
  console.error("verification.json の pass が false です。#20の検証を先に通してください。");
  process.exit(1);
}

const inputFile = JSON.parse(await readFile(resolve(ROOT, INPUT_PATH), "utf8")) as {
  records: ExecutionRecord[];
};
const scanRecords: ScanRecord[] = inputFile.records.map(buildScanRecord);

// ランキングは目レベルの明細を対象とする（款・項は集約行のため重複計上を避ける）。
const itemLevelRecords = scanRecords.filter((record) => record.accountKey.item !== "");

const scan = {
  fiscalYear: 2024 as const,
  generatedFrom: INPUT_PATH,
  criteria: {
    rateRankingMinBudgetYen: RATE_RANKING_MIN_BUDGET_YEN,
    rankingLimit: RANKING_LIMIT,
    rankingTieBreak: "value desc, then stable key asc",
    rankingTargetLevel: "item",
  },
  records: scanRecords,
  summary: {
    counts: {
      total: scanRecords.length,
      policyReviewTarget: scanRecords.filter((record) => !record.policyReview.excluded).length,
      policyReviewExcluded: scanRecords.filter((record) => record.policyReview.excluded).length,
    },
    rankings: {
      unusedAmountTop: rankScanRecords(itemLevelRecords, { field: "unusedAmount" }),
      unusedRateTop: rankScanRecords(itemLevelRecords, {
        field: "unusedRate",
        minBudgetYen: RATE_RANKING_MIN_BUDGET_YEN,
      }),
      carryoverAmountTop: rankScanRecords(itemLevelRecords, { field: "carryoverAmount" }),
      carryoverRateTop: rankScanRecords(itemLevelRecords, {
        field: "carryoverRate",
        minBudgetYen: RATE_RANKING_MIN_BUDGET_YEN,
      }),
    },
  },
};

await mkdir(dirname(resolve(ROOT, OUTPUT_PATH)), { recursive: true });
await writeFile(resolve(ROOT, OUTPUT_PATH), `${JSON.stringify(scan, null, 1)}\n`, "utf8");

console.log(
  JSON.stringify({
    output: OUTPUT_PATH,
    records: scan.records.length,
    counts: scan.summary.counts,
    rankingSizes: Object.fromEntries(
      Object.entries(scan.summary.rankings).map(([name, list]) => [name, list.length]),
    ),
  }),
);
