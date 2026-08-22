#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPolicyReviewDetails,
} from "../../src/execution-review/policy-review-details.ts";
import { validatePolicyReviewFile } from "../../src/execution-review/policy-review-types.ts";

/**
 * Issue #40: 重点レビュー4系統を統合・検証した詳細JSONを生成する。
 *
 * - 入力: selected-policy-reviews.json（#35）、policy-reviews-{direct,procurement,construction,subsidy}.json（#36〜#39）、
 *   review-candidates.json（#30）、payment-evidence.json（#33）
 * - 出力: data/normalized/execution-review/policy-review-details.json
 * - 重複・欠落・参照切れ・型違反があれば非0で終了する。
 */

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const MANUAL_DIR = "data/manual/execution-review";
const REVIEW_FILES = [
  "policy-reviews-direct.json",
  "policy-reviews-procurement.json",
  "policy-reviews-construction.json",
  "policy-reviews-subsidy.json",
] as const;
const CANDIDATES_PATH = "data/normalized/execution-review/review-candidates.json";
const PAYMENT_PATH = "data/normalized/execution-review/payment-evidence.json";
const OUTPUT_PATH = "data/normalized/execution-review/policy-review-details.json";

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

const selectionsFile = (await readJson(`${MANUAL_DIR}/selected-policy-reviews.json`)) as {
  selections: Parameters<typeof buildPolicyReviewDetails>[0]["selections"];
};
const reviewFiles: Record<string, unknown> = {};
for (const name of REVIEW_FILES) {
  reviewFiles[name] = await readJson(`${MANUAL_DIR}/${name}`);
}
const candidatesFile = (await readJson(CANDIDATES_PATH)) as {
  records: Parameters<typeof buildPolicyReviewDetails>[0]["candidates"];
};
const paymentFile = (await readJson(PAYMENT_PATH)) as {
  candidates: Parameters<typeof buildPolicyReviewDetails>[0]["paymentCandidates"];
};

// #34のデータ契約検証（タグの妥当性・staffing根拠・confirmed以外でのタグ使用）
for (const [name, file] of Object.entries(reviewFiles)) {
  const result = validatePolicyReviewFile(file);
  if (!result.valid) {
    console.error(`${name} が #34 の型契約を満たしません:`);
    for (const error of result.errors) console.error(`  - ${error}`);
    process.exit(1);
  }
}

const { errors, records } = buildPolicyReviewDetails({
  selections: selectionsFile.selections,
  reviewFiles,
  candidates: candidatesFile.records,
  paymentCandidates: paymentFile.candidates,
});
if (errors.length > 0) {
  console.error("統合検証に失敗しました:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
if (records.length > 20) {
  console.error(`詳細が20件を超えています: ${records.length}`);
  process.exit(1);
}

await mkdir(dirname(resolve(ROOT, OUTPUT_PATH)), { recursive: true });
const output = {
  fiscalYearPair: [2024, 2026] as const,
  generatedFrom: {
    selections: `${MANUAL_DIR}/selected-policy-reviews.json`,
    reviews: REVIEW_FILES.map((name) => `${MANUAL_DIR}/${name}`),
    candidates: CANDIDATES_PATH,
    paymentEvidence: PAYMENT_PATH,
  },
  metadata: {
    note: [
      "analysis は分析上の判定（#30の状態分類・率・金額）。review は公式資料で確認できた事実と確認できなかった事項（not-found）。paymentEvidence は公金支出の補助証拠であり執行率の分子にはしない。",
      "executionMethod=unknown の候補は公式説明だけでは方式を確定できなかったもので、review は null のまま残す（推測で埋めない）。",
      "支払実績のない候補は paymentEvidence を null で保持する。",
    ],
  },
  records,
  summary: {
    detailCount: records.length,
    reviewedCount: records.filter((r) => r.review != null).length,
    unreviewedCount: records.filter((r) => r.review == null).length,
    withPaymentEvidenceCount: records.filter((r) => r.paymentEvidence != null).length,
    byExecutionMethod: records.reduce<Record<string, number>>((acc, r) => {
      acc[r.executionMethod] = (acc[r.executionMethod] ?? 0) + 1;
      return acc;
    }, {}),
  },
};
await writeFile(resolve(ROOT, OUTPUT_PATH), `${JSON.stringify(output, null, 1)}\n`, "utf8");

console.log(
  JSON.stringify({
    output: OUTPUT_PATH,
    detailCount: output.summary.detailCount,
    reviewedCount: output.summary.reviewedCount,
    unreviewedCount: output.summary.unreviewedCount,
  }),
);
