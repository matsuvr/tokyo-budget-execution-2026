import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import worker from "../src/worker.ts";
import type { DataManifest, Env, R2ObjectBody } from "../src/types.ts";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const checks: { name: string; pass: boolean; details?: unknown }[] = [];

function check(name: string, pass: boolean, details?: unknown): void {
  checks.push({ name, pass, details });
  if (!pass) console.error(`FAIL: ${name}`, details ?? "");
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(join(ROOT, relativePath), "utf8")) as T;
}

async function countLines(relativePath: string): Promise<number> {
  let count = 0;
  const reader = createInterface({
    input: createReadStream(join(ROOT, relativePath)),
    crlfDelay: Infinity,
  });
  for await (const line of reader) if (line.trim()) count += 1;
  return count;
}

const budgetIndex = await readJson<Array<{ fiscalYears: number[]; recordCount: number }>>(
  "data/normalized/budget/index.json",
);
check("budget series count is 15", budgetIndex.length === 15, budgetIndex.length);
check(
  "every budget series contains FY2025 and FY2026",
  budgetIndex.every(
    (entry) =>
      entry.fiscalYears.includes(2025) && entry.fiscalYears.includes(2026) && entry.recordCount > 0,
  ),
);

const settlementIndex = await readJson<Array<{ latestFiscalYear: number; recordCount: number }>>(
  "data/normalized/settlement/index.json",
);
check("settlement series count is 10", settlementIndex.length === 10, settlementIndex.length);
check(
  "settlement comparison latest fiscal year is 2024",
  settlementIndex.every((entry) => entry.latestFiscalYear === 2024 && entry.recordCount > 0),
);

for (const fiscalYear of [2025, 2026] as const) {
  const expenditure = await readJson<{
    transactionCount: number;
    transactionAmountYen: number;
    payrollAmountYen: number;
    sourceMonths: string[];
    transactionFileCount: number;
    invalidDateCount: number;
    skippedNonDataRowCount: number;
  }>(`data/normalized/public-expenditure/fy${fiscalYear}/summary.json`);
  const transactionLineCount = await countLines(
    `data/normalized/public-expenditure/fy${fiscalYear}/transactions.jsonl`,
  );
  check(
    `FY${fiscalYear} transaction JSONL count matches summary`,
    transactionLineCount === expenditure.transactionCount,
    {
      transactionLineCount,
      summary: expenditure.transactionCount,
    },
  );
  check(
    `FY${fiscalYear} public expenditure file coverage`,
    expenditure.transactionFileCount === (fiscalYear === 2025 ? 14 : 3),
    expenditure.transactionFileCount,
  );
  check(
    `FY${fiscalYear} public expenditure amounts are positive`,
    expenditure.transactionAmountYen > 0 && expenditure.payrollAmountYen > 0,
  );
  check(
    `FY${fiscalYear} all transaction dates parsed`,
    expenditure.invalidDateCount === 0,
    expenditure.invalidDateCount,
  );
  check(
    `FY${fiscalYear} non-data footers were skipped`,
    expenditure.skippedNonDataRowCount > 0,
    expenditure.skippedNonDataRowCount,
  );
}

const subsidyIndex = await readJson<
  Array<{ fiscalYear: number; recordCount: number; totalBudgetThousandYen: number }>
>("data/normalized/subsidies/index.json");
check(
  "subsidies include FY2025 and FY2026",
  subsidyIndex.length === 2 &&
    subsidyIndex.some((entry) => entry.fiscalYear === 2025) &&
    subsidyIndex.some((entry) => entry.fiscalYear === 2026),
  subsidyIndex,
);
check(
  "subsidy rows are populated",
  subsidyIndex.every((entry) => entry.recordCount > 1_000 && entry.totalBudgetThousandYen > 0),
);

const closingEstimate = await readJson<{
  fiscalYear: number;
  status: string;
  records: Array<{ metric: string; fiscalYear2025HundredMillionYen: number }>;
}>("data/normalized/closing-estimate/fy2025.json");
const closingRevenue = closingEstimate.records.find((record) => record.metric === "revenue");
const closingExpenditure = closingEstimate.records.find(
  (record) => record.metric === "expenditure",
);
check(
  "FY2025 preliminary closing estimate identity",
  closingEstimate.fiscalYear === 2025 && closingEstimate.status === "preliminary",
);
check(
  "FY2025 preliminary closing estimate values",
  closingRevenue?.fiscalYear2025HundredMillionYen === 92_960 &&
    closingExpenditure?.fiscalYear2025HundredMillionYen === 90_819,
  { closingRevenue, closingExpenditure },
);

const manifest = await readJson<DataManifest>("data/manifest.json");
let verifiedHashes = 0;
for (const source of manifest.sources) {
  if (source.status !== "downloaded" || !source.localPath) continue;
  const path = join(ROOT, source.localPath);
  check(`manifest local file exists: ${source.id}`, existsSync(path), source.localPath);
  if (!existsSync(path)) continue;
  const bytes = await readFile(path);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const size = (await stat(path)).size;
  check(`manifest hash: ${source.id}`, digest === source.sha256, {
    expected: source.sha256,
    actual: digest,
  });
  check(`manifest size: ${source.id}`, size === source.bytes, {
    expected: source.bytes,
    actual: size,
  });
  verifiedHashes += 1;
}
check("downloaded source hashes verified", verifiedHashes >= 47, verifiedHashes);

const localBucket: Env["DATA"] = {
  async get(key: string): Promise<R2ObjectBody | null> {
    const path = join(ROOT, key);
    if (!existsSync(path)) return null;
    const bytes = await readFile(path);
    return {
      body: new Blob([bytes]).stream(),
      size: bytes.length,
      httpEtag: createHash("sha1").update(bytes).digest("hex"),
    };
  },
};
const env: Env = { DATA: localBucket };
const apiCases = [
  "/",
  "/manifest",
  "/coverage",
  "/budget",
  "/budget/01_sainyu_saishutsu?year=2026",
  "/settlement/01_sainyu",
  "/expenditure",
  "/expenditure/summary?year=2025&dimension=month",
  "/expenditure/summary?year=2026&dimension=month",
  "/subsidies/summary?year=2026",
  "/closing-estimate/2025",
  "/catalog",
];
for (const path of apiCases) {
  const response = await worker.fetch(new Request(`https://example.test${path}`), env);
  check(`worker endpoint ${path}`, response.status === 200, response.status);
  await response.arrayBuffer();
}

const pass = checks.every((entry) => entry.pass);
const report = {
  generatedAt: new Date().toISOString(),
  pass,
  checkCount: checks.length,
  failedCheckCount: checks.filter((entry) => !entry.pass).length,
  checks,
};
await writeFile(
  join(ROOT, "data", "verification-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
console.log(
  JSON.stringify({ pass, checkCount: checks.length, failed: report.failedCheckCount }, null, 2),
);
if (!pass) process.exit(1);
