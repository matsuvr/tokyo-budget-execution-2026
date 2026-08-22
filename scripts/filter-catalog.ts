import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeText, parseCsvEach, stringifyCsv } from "../src/lib/csv.ts";
import { cleanCell } from "../src/lib/normalize.ts";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const defaultSource = resolve(ROOT, "..", "tokyo_od_api_list.csv");
const sourcePath = process.env.TOKYO_API_LIST_PATH ?? defaultSource;
const outputRaw = join(ROOT, "data", "raw", "catalog", "relevant-api-catalog.csv");
const outputJson = join(ROOT, "data", "normalized", "catalog", "relevant-api-catalog.json");
const sourceUrl =
  "https://data.storage.data.metro.tokyo.lg.jp/digitalservice/130001_tokyo_opendata_api_list.csv";
const portableSourceFile = "data/raw/catalog/relevant-api-catalog.csv";
const sourceSnapshotDate = "2025-02-25";

const datasetIds = new Set([
  "t000004d0000000005", // 予算見える化
  "t000004d1800000020", // 決算見える化
  "t000004d1800000017", // 財務諸表見える化
  "t000004d1800000019", // 補助金サーチ
  "t000016d0000000005", // 公金支出
]);
const titlePattern = /予算|決算|公金支出|補助金|財務諸表|財政/i;

if (!existsSync(sourcePath)) {
  console.log(
    `Catalog source not found; leaving existing filtered catalog unchanged: ${sourcePath}`,
  );
  process.exit(0);
}

const decoded = decodeText(await readFile(sourcePath));
let headers: string[] = [];
let datasetIdIndex = -1;
let datasetTitleIndex = -1;
let apiNameIndex = -1;
const selectedRows: string[][] = [];

parseCsvEach(decoded.text, (row, rowIndex) => {
  if (rowIndex === 0) {
    headers = row.map(cleanCell);
    datasetIdIndex = headers.indexOf("datasetId");
    datasetTitleIndex = headers.indexOf("datasetTitle");
    apiNameIndex = headers.indexOf("apiName");
    selectedRows.push(headers);
    return;
  }
  const datasetId = cleanCell(row[datasetIdIndex]);
  const datasetTitle = cleanCell(row[datasetTitleIndex]);
  const apiName = cleanCell(row[apiNameIndex]);
  if (datasetIds.has(datasetId) || titlePattern.test(`${datasetTitle} ${apiName}`)) {
    selectedRows.push(headers.map((_, index) => row[index] ?? ""));
  }
});

const records = selectedRows
  .slice(1)
  .map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, cleanCell(row[index])])),
  );
await mkdir(resolve(outputRaw, ".."), { recursive: true });
await mkdir(resolve(outputJson, ".."), { recursive: true });
await writeFile(outputRaw, `\uFEFF${stringifyCsv(selectedRows)}`, "utf8");
await writeFile(
  outputJson,
  `${JSON.stringify(
    {
      sourceFile: portableSourceFile,
      sourceUrl,
      sourceSnapshotDate,
      sourceEncoding: decoded.encoding,
      generatedAt: new Date().toISOString(),
      caveat:
        "東京都オープンデータAPI一覧の2025-02-25スナップショットから財政関係行のみ抽出。最新性の判定には各原本・公式ページを優先する。",
      recordCount: records.length,
      records,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
console.log(
  JSON.stringify({ sourcePath, outputRaw, outputJson, recordCount: records.length }, null, 2),
);
