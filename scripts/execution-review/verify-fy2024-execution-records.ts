#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  verifyBudgetIdentity,
  verifyOfficialTotals,
  type OfficialTotalFixture,
} from "../../src/execution-review/settlement/verify-execution.ts";
import type { ExecutionRecord } from "../../src/execution-review/types.ts";

/**
 * Issue #20: 予算現額の会計恒等式と公式総額を検証する。
 * - 恒等式: 予算現額 = 支出済額 + 翌年度繰越額 + 不用額（許容差0円）
 * - 公式総額: 決算の総括（主要施策の成果）の手動転記fixtureと照合。
 * - 結果を data/normalized/execution-review/fy2024/verification.json へ保存し、
 *   重大な不一致がある場合は終了コード1で終了する。
 */

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const RECORDS_PATH = "data/normalized/execution-review/fy2024/execution-records.json";
const FIXTURE_PATH = "tests/fixtures/execution-review/fy2024-official-totals.json";
const OUTPUT_PATH = "data/normalized/execution-review/fy2024/verification.json";

const recordsFile = JSON.parse(await readFile(resolve(ROOT, RECORDS_PATH), "utf8")) as {
  records: ExecutionRecord[];
};
const fixtureFile = JSON.parse(await readFile(resolve(ROOT, FIXTURE_PATH), "utf8")) as {
  source: { title: string; page: number | null };
  totals: Omit<OfficialTotalFixture, "level" | "sourceTitle" | "sourcePage">[];
};

const identity = verifyBudgetIdentity(recordsFile.records, { toleranceYen: 0 });
const officialTotals = verifyOfficialTotals(
  recordsFile.records,
  fixtureFile.totals.map((total) => ({
    ...total,
    level: "chapter" as const,
    sourceTitle: fixtureFile.source.title,
    sourcePage: fixtureFile.source.page,
  })),
);

const pass = identity.mismatched.length === 0 && officialTotals.every((entry) => entry.pass);
const verification = {
  fiscalYear: 2024,
  generatedAt: new Date().toISOString(),
  identity: {
    toleranceYen: 0,
    formula: "予算現額 = 支出済額 + 翌年度繰越額 + 不用額",
    checked: identity.checked,
    passed: identity.passed,
    notVerifiable: identity.notVerifiable,
    derivedSkipped: identity.derivedSkipped,
    mismatched: identity.mismatched,
  },
  officialTotals,
  pass,
};

await mkdir(dirname(resolve(ROOT, OUTPUT_PATH)), { recursive: true });
await writeFile(resolve(ROOT, OUTPUT_PATH), `${JSON.stringify(verification, null, 1)}\n`, "utf8");

for (const mismatch of identity.mismatched) {
  console.error(
    `IDENTITY MISMATCH\t${mismatch.key}\tpage=${mismatch.pageNumber}\tdiff=${mismatch.differenceYen}`,
  );
}
for (const comparison of officialTotals) {
  console.log(
    `${comparison.pass ? "OK" : "NG"}\t${comparison.name}\tofficial=${comparison.officialYen}\tactual=${comparison.actualSumYen}\tdiff=${comparison.differenceYen}`,
  );
}
console.log(JSON.stringify({ pass, identityChecked: identity.checked, mismatched: identity.mismatched.length }));

if (!pass) process.exit(1);
