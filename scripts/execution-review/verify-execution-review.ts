#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPolicyReviewDetails,
} from "../../src/execution-review/policy-review-details.ts";
import { validatePolicyReviewFile } from "../../src/execution-review/policy-review-types.ts";

/**
 * Issue #55: 執行レビューパイプラインの最終検証。
 * - 会計恒等式（予算現額 = 支出済 + 翌年度繰越 + 不用）を全執行レコードで再計算する。
 * - 対応表validatorの出力と、政策レビューの参照整合・#34契約を再検証する。
 * - index.json の件数が各実ファイルと一致することを確認する。
 * - Web APIが返すJSONの最小形状（fixture契約）を検証する。
 * 1つでも失敗すれば非0で終了する。
 */

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DIR = "data/normalized/execution-review";

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

const failures: string[] = [];
function check(condition: boolean, message: string): void {
  if (!condition) failures.push(message);
}

// 1. 会計恒等式と公式総額検証の結果
const verificationFile = (await readJson(`${DIR}/fy2024/verification.json`)) as {
  pass: boolean;
  checks: { name: string; pass: boolean }[];
};
check(verificationFile.pass === true, "fy2024/verification.json の pass が true ではありません");
for (const c of verificationFile.checks ?? []) {
  if (c.pass !== true) failures.push(`検証チェックが失敗しています: ${c.name}`);
}

const recordsFile = (await readJson(`${DIR}/fy2024/execution-records.json`)) as {
  records: {
    currentBudgetYen: number | null;
    spentYen: number | null;
    carryoverYen: number | null;
    unusedYen: number | null;
  }[];
};
let identityFailures = 0;
for (const record of recordsFile.records) {
  const { currentBudgetYen, spentYen, carryoverYen, unusedYen } = record;
  // 欠損は0で補わないため、欠損行は恒等式判定から除外する
  if (currentBudgetYen == null || spentYen == null || carryoverYen == null || unusedYen == null) {
    continue;
  }
  const identityOk =
    BigInt(currentBudgetYen) === BigInt(spentYen) + BigInt(carryoverYen) + BigInt(unusedYen);
  if (!identityOk) identityFailures += 1;
}
check(identityFailures === 0, `会計恒等式不一致のレコードが${identityFailures}件あります`);

// 2. index件数と実ファイルの一致
const index = (await readJson(`${DIR}/index.json`)) as {
  scope: { account: string };
  scan: { total: number; policyReviewTarget: number; policyReviewExcluded: number } | null;
  comparisons: { comparableCount: number; byConfidence: Record<string, number> };
  reviewCandidates: { count: number; byStatus: Record<string, number>; thresholds: Record<string, number> };
  bureauSummary: {
    bureauCount: number;
    totalComparableCount: number;
    totalFy2024CurrentBudgetYen: number;
  };
  policyReviews: { status: string; detailsFile: string | null; reviewedCount: number };
};

const scan = (await readJson(`${DIR}/fy2024/execution-scan.json`)) as {
  summary: { counts: { total: number; policyReviewTarget: number; policyReviewExcluded: number } };
};
check(index.scan?.total === scan.summary.counts.total, "indexのscan件数がexecution-scan.jsonと一致しません");

const comparisons = (await readJson(`${DIR}/budget-comparisons.json`)) as {
  records: { confidence: string }[];
};
check(
  index.comparisons.comparableCount === comparisons.records.length,
  "indexの比較可能件数がbudget-comparisons.jsonと一致しません",
);

const candidates = (await readJson(`${DIR}/review-candidates.json`)) as {
  records: { status: string }[];
  thresholds: Record<string, number>;
};
check(index.reviewCandidates.count === candidates.records.length, "indexの候補件数が一致しません");
const recomputedStatus: Record<string, number> = {};
for (const r of candidates.records) recomputedStatus[r.status] = (recomputedStatus[r.status] ?? 0) + 1;
check(
  JSON.stringify(index.reviewCandidates.byStatus) === JSON.stringify(recomputedStatus),
  "indexのstatus別件数が一致しません",
);
check(
  JSON.stringify(Object.keys(index.reviewCandidates.thresholds).sort()) ===
    JSON.stringify(Object.keys(candidates.thresholds).sort()),
  "indexの閾値キーがreview-candidates.jsonと一致しません",
);

const bureaus = (await readJson(`${DIR}/bureau-summary.json`)) as {
  bureaus: unknown[];
  summary: { totalComparableCount: number; totalFy2024CurrentBudgetYen: number };
};
check(
  index.bureauSummary.bureauCount === bureaus.bureaus.length &&
    index.bureauSummary.totalComparableCount === bureaus.summary.totalComparableCount,
  "indexの局別サマリー件数がbureau-summary.jsonと一致しません",
);

// 3. 政策レビュー詳細の参照整合・#34契約
const manualDir = "data/manual/execution-review";
const selectionsFile = (await readJson(`${manualDir}/selected-policy-reviews.json`)) as {
  selections: Parameters<typeof buildPolicyReviewDetails>[0]["selections"];
};
const reviewFiles: Record<string, unknown> = {};
for (const name of [
  "policy-reviews-direct.json",
  "policy-reviews-procurement.json",
  "policy-reviews-construction.json",
  "policy-reviews-subsidy.json",
]) {
  const file = await readJson(`${manualDir}/${name}`);
  reviewFiles[name] = file;
  const result = validatePolicyReviewFile(file);
  check(result.valid, `${name} が#34契約を満たしません: ${result.errors.join(" / ")}`);
}
const candidatesFull = (await readJson(`${DIR}/review-candidates.json`)) as {
  records: Parameters<typeof buildPolicyReviewDetails>[0]["candidates"];
};
const payment = (await readJson(`${DIR}/payment-evidence.json`)) as {
  candidates: Parameters<typeof buildPolicyReviewDetails>[0]["paymentCandidates"];
};
const rebuilt = buildPolicyReviewDetails({
  selections: selectionsFile.selections,
  reviewFiles,
  candidates: candidatesFull.records,
  paymentCandidates: payment.candidates,
});
check(rebuilt.errors.length === 0, `政策レビュー統合検証エラー: ${rebuilt.errors.join(" / ")}`);

const committed = (await readJson(`${DIR}/policy-review-details.json`)) as {
  records: unknown[];
};
check(
  committed.records.length === rebuilt.records.length &&
    JSON.stringify(committed.records) === JSON.stringify(rebuilt.records),
  "committedなpolicy-review-details.jsonが現在の入力から再生成した結果と一致しません（prepare:execution-reviewを再実行してください）",
);

// 4. API fixture形状（Webクライアント web/types.ts が期待する最低限のフィールド）
check(index.scope != null && index.policyReviews != null, "index.jsonにscope/policyReviewsがありません");
check(Array.isArray(committed.records), "policy-review-details.jsonのrecordsが配列ではありません");

if (failures.length > 0) {
  console.error("verify:execution-review 失敗:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  JSON.stringify({
    ok: true,
    executionRecords: recordsFile.records.length,
    comparableCount: index.comparisons.comparableCount,
    candidateCount: index.reviewCandidates.count,
    detailCount: committed.records.length,
  }),
);
