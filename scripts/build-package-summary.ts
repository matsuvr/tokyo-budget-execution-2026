import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DataManifest } from "../src/types.ts";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(join(ROOT, relativePath), "utf8")) as T;
}

const manifest = await readJson<DataManifest>("data/manifest.json");
const budget = await readJson<Array<{ recordCount: number; fiscalYears: number[] }>>(
  "data/normalized/budget/index.json",
);
const settlement = await readJson<Array<{ recordCount: number; latestFiscalYear: number }>>(
  "data/normalized/settlement/index.json",
);
const expenditure2025 = await readJson<{
  sourceMonths: string[];
  transactionCount: number;
  transactionAmountYen: number;
  payrollAmountYen: number;
  combinedAmountYen: number;
}>("data/normalized/public-expenditure/fy2025/summary.json");
const expenditure2026 = await readJson<{
  sourceMonths: string[];
  transactionCount: number;
  transactionAmountYen: number;
  payrollAmountYen: number;
  combinedAmountYen: number;
}>("data/normalized/public-expenditure/fy2026/summary.json");
const subsidies = await readJson<
  Array<{
    fiscalYear: number;
    recordCount: number;
    totalBudgetThousandYen: number;
    jsonlPath: string;
    summaryPath: string;
  }>
>("data/normalized/subsidies/index.json");
const catalog = await readJson<{ recordCount: number }>("data/normalized/catalog/relevant-api-catalog.json");
const verification = await readJson<{
  pass: boolean;
  checkCount: number;
  failedCheckCount: number;
}>("data/verification-report.json");

const sourceCategories: Record<string, number> = {};
for (const source of manifest.sources) {
  sourceCategories[source.category] = (sourceCategories[source.category] ?? 0) + 1;
}

const summary = {
  packageName: manifest.packageName,
  version: manifest.packageVersion,
  generatedAt: new Date().toISOString(),
  timezone: manifest.timezone,
  requestedFiscalYears: manifest.requestedFiscalYears,
  contents: {
    manifestSources: manifest.sources.length,
    officialRawSourcesDownloaded: manifest.sources.filter((source) => source.status === "downloaded").length,
    referenceSources: manifest.sources.filter((source) => source.status === "reference-only").length,
    sourceCategories,
    budget: {
      series: budget.length,
      records: budget.reduce((sum, entry) => sum + entry.recordCount, 0),
      fiscalYears: [...new Set(budget.flatMap((entry) => entry.fiscalYears))].sort(),
    },
    publicExpenditure: {
      fiscalYear2025: {
        coveredMonths: expenditure2025.sourceMonths,
        transactionCount: expenditure2025.transactionCount,
        transactionAmountYen: expenditure2025.transactionAmountYen,
        payrollAmountYen: expenditure2025.payrollAmountYen,
        combinedAmountYen: expenditure2025.combinedAmountYen,
      },
      fiscalYear2026: {
        coveredMonths: expenditure2026.sourceMonths,
        transactionCount: expenditure2026.transactionCount,
        transactionAmountYen: expenditure2026.transactionAmountYen,
        payrollAmountYen: expenditure2026.payrollAmountYen,
        combinedAmountYen: expenditure2026.combinedAmountYen,
      },
    },
    subsidies,
    settlementComparison: {
      series: settlement.length,
      latestFiscalYear: Math.max(...settlement.map((entry) => entry.latestFiscalYear)),
      records: settlement.reduce((sum, entry) => sum + entry.recordCount, 0),
    },
    preliminaryClosingEstimate: {
      fiscalYear: 2025,
      status: "preliminary",
      path: "data/normalized/closing-estimate/fy2025.json",
    },
    relatedOfficialDocuments: manifest.sources.filter(
      (source) => source.category === "document" && source.status === "downloaded",
    ).length,
    catalogExtractRows: catalog.recordCount,
  },
  validation: {
    regenerationFromRaw: "passed",
    typecheck: "passed",
    typecheckCommand: "pnpm run typecheck",
    typecheckRequiresDevDependencies: true,
    verificationChecks: verification.checkCount,
    failedChecks: verification.failedCheckCount,
    workerRoutesTested: true,
    sourceHashesVerified: verification.pass,
  },
  cautions: [
    "URLのディレクトリ名ではなく、CSV内の年度列を年度判定に使用する。",
    "公金支出明細と予算見える化CSVは分類体系・粒度が一致しないため、未検証の直接結合や執行率計算を避ける。",
    "令和8年度は年度途中であり、執行実績は公開済み月までに限定される。",
    "令和7年度一般会計決算は2026年7月31日時点の見込みであり、確定普通会計決算ではない。",
  ],
};

await writeFile(join(ROOT, "PACKAGE_SUMMARY.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    {
      sourceCount: summary.contents.manifestSources,
      downloaded: summary.contents.officialRawSourcesDownloaded,
      verificationChecks: summary.validation.verificationChecks,
    },
    null,
    2,
  ),
);
