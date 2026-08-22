import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeText, parseCsv } from "../src/lib/csv.ts";
import { readFirstWorksheet } from "../src/lib/xlsx.ts";
import {
  cleanCell,
  coerceCell,
  normalizeHeader,
  parseJapaneseEraDate,
  parseJapaneseEraMonth,
  parseNumber,
  splitObjectAndSubObject,
  uniqueHeaders,
} from "../src/lib/normalize.ts";
import type { PayrollRecord, PublicExpenditureRecord, SubsidyRecord } from "../src/types.ts";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const RAW = join(ROOT, "data", "raw");
const NORMALIZED = join(ROOT, "data", "normalized");
const TARGET_YEARS = new Set([2025, 2026]);

const BUDGET_TITLES: Record<string, string> = {
  "01_sainyu_saishutsu": "一般会計 歳入歳出予算",
  "02_zaiseikibo_ippansaishutsu_suii": "財政規模・一般歳出の推移",
  "03_hitoriatari_yosan": "都民1人当たりの予算",
  "04_seishitsubetsu": "一般会計歳出予算 性質別内訳",
  "05_mokutekibetsu": "一般歳出 目的別内訳",
  "06_kyuyo_kankeihi": "給与関係費",
  "07_toshiteki_keihi": "投資的経費",
  "08_sainyu_uchiwake": "一般会計 歳入内訳",
  "09_tozei_uchiwake": "都税内訳",
  "10_tozei_suii": "都税収入の推移",
  "14_kikin_zandaka_suii": "基金の残高推移",
  "15_kikin_tsumitate_torikuzushi_jyokyo": "基金の積立・取崩状況",
  "16_tosai_hakkougaku_zandaka_suii": "都債発行額と都債残高の推移",
  "17_kisai_izondo_suii": "起債依存度の推移",
  "18_nation_region": "都予算・国予算・地方財政計画",
};

const SETTLEMENT_TITLES: Record<string, string> = {
  "01_sainyu": "普通会計決算 歳入",
  "02_tozeiutiwake": "普通会計決算 都税内訳",
  "03_seisitubetusaishutu": "普通会計決算 性質別歳出",
  "04_mokutekibetusaishutu": "普通会計決算 目的別歳出",
  "05_jissituakajihiritu": "実質赤字比率",
  "06_renketujissituakajihiritu": "連結実質赤字比率",
  "07_jissitukousaihihiritu": "実質公債費比率",
  "08_shouraihutanhiritu": "将来負担比率",
  "09_keijoushusihiritu": "経常収支比率",
  "10_kousaihihutanhiritu": "公債費負担比率",
};

async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await ensureDirectory(resolve(path, ".."));
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readCsv(path: string): Promise<{
  encoding: string;
  rows: string[][];
}> {
  const bytes = await readFile(path);
  const decoded = decodeText(bytes);
  return { encoding: decoded.encoding, rows: parseCsv(decoded.text) };
}

async function readTabular(path: string): Promise<{
  encoding: string;
  rows: string[][];
}> {
  if (path.toLowerCase().endsWith(".xlsx")) {
    return { encoding: "xlsx", rows: await readFirstWorksheet(path) };
  }
  return readCsv(path);
}

function rowsToRecords(rows: string[][], headerIndex = 0): Record<string, unknown>[] {
  const headers = uniqueHeaders(rows[headerIndex] ?? []);
  const records: Record<string, unknown>[] = [];
  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row || row.every((value) => !cleanCell(value))) continue;
    const record: Record<string, unknown> = {};
    for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
      record[headers[columnIndex]] = coerceCell(headers[columnIndex], row[columnIndex] ?? "");
    }
    records.push(record);
  }
  return records;
}

async function normalizeBudget(): Promise<unknown[]> {
  const sourceDirectory = join(RAW, "budget");
  const outputDirectory = join(NORMALIZED, "budget");
  await ensureDirectory(outputDirectory);
  const files = (await readdir(sourceDirectory)).filter((file) => file.endsWith(".csv")).sort();
  const index: unknown[] = [];

  for (const file of files) {
    const sourcePath = join(sourceDirectory, file);
    const key = basename(file, extname(file));
    const { encoding, rows } = await readCsv(sourcePath);
    const headers = uniqueHeaders(rows[0] ?? []);
    let records: Record<string, unknown>[];

    if (key === "03_hitoriatari_yosan") {
      const yearIndexes = [2025, 2026]
        .map((year) => ({ year, index: headers.indexOf(String(year)) }))
        .filter(({ index }) => index >= 0);
      records = [];
      for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex];
        const category = cleanCell(row?.[0]);
        if (!category) continue;
        for (const { year, index: columnIndex } of yearIndexes) {
          records.push({
            年度: year,
            区分: category,
            "金額（円）": parseNumber(row[columnIndex]),
          });
        }
      }
    } else {
      records = rowsToRecords(rows).filter((record) => {
        const year = Number(record["年度"]);
        return TARGET_YEARS.has(year);
      });
    }

    const fiscalYears = [...new Set(records.map((record) => Number(record["年度"])))].sort();
    const output = {
      dataset: "TOKYO予算見える化ボード",
      key,
      title: BUDGET_TITLES[key] ?? key,
      sourceFile: `data/raw/budget/${file}`,
      sourceEncoding: encoding,
      fiscalYears,
      columns: records.length > 0 ? Object.keys(records[0]) : [],
      recordCount: records.length,
      records,
    };
    await writeJson(join(outputDirectory, `${key}.json`), output);
    index.push({
      key,
      title: output.title,
      fiscalYears,
      recordCount: records.length,
      path: `data/normalized/budget/${key}.json`,
    });
  }

  await writeJson(join(outputDirectory, "index.json"), index);
  return index;
}

async function normalizeSettlement(): Promise<unknown[]> {
  const sourceDirectory = join(RAW, "settlement");
  const outputDirectory = join(NORMALIZED, "settlement");
  await ensureDirectory(outputDirectory);
  const files = (await readdir(sourceDirectory)).filter((file) => file.endsWith(".csv")).sort();
  const index: unknown[] = [];

  for (const file of files) {
    const sourcePath = join(sourceDirectory, file);
    const key = basename(file, extname(file));
    const { encoding, rows } = await readCsv(sourcePath);
    const records = rowsToRecords(rows);
    const years = records
      .map((record) => Number(record["年度"]))
      .filter((year) => Number.isFinite(year));
    const fiscalYears = [...new Set(years)].sort((a, b) => a - b);
    const output = {
      dataset: "TOKYO決算見える化ボード",
      key,
      title: SETTLEMENT_TITLES[key] ?? key,
      sourceFile: `data/raw/settlement/${file}`,
      sourceEncoding: encoding,
      fiscalYears,
      latestFiscalYear: fiscalYears.at(-1) ?? null,
      columns: records.length > 0 ? Object.keys(records[0]) : [],
      recordCount: records.length,
      records,
    };
    await writeJson(join(outputDirectory, `${key}.json`), output);
    index.push({
      key,
      title: output.title,
      fiscalYears,
      latestFiscalYear: output.latestFiscalYear,
      recordCount: records.length,
      path: `data/normalized/settlement/${key}.json`,
    });
  }

  await writeJson(join(outputDirectory, "index.json"), index);
  return index;
}

function headerIndex(headers: string[], predicate: (header: string) => boolean): number {
  return headers.findIndex((header) => predicate(normalizeHeader(header)));
}

function addAggregate(
  map: Map<string, { key: string; transactionCount: number; amountYen: number }>,
  key: string,
  amountYen: number,
): void {
  const normalizedKey = key || "(空欄)";
  const aggregate = map.get(normalizedKey) ?? {
    key: normalizedKey,
    transactionCount: 0,
    amountYen: 0,
  };
  aggregate.transactionCount += 1;
  aggregate.amountYen += amountYen;
  map.set(normalizedKey, aggregate);
}

function sortedAggregates(
  map: Map<string, { key: string; transactionCount: number; amountYen: number }>,
): { key: string; transactionCount: number; amountYen: number }[] {
  return [...map.values()].sort(
    (a, b) => b.amountYen - a.amountYen || a.key.localeCompare(b.key, "ja"),
  );
}

async function writeLine(
  stream: ReturnType<typeof createWriteStream>,
  value: unknown,
): Promise<void> {
  if (!stream.write(`${JSON.stringify(value)}\n`, "utf8")) await once(stream, "drain");
}

interface PublicYearResult {
  fiscalYear: 2024 | 2025 | 2026;
  transactionCount: number;
  transactionAmountYen: number;
  payrollAmountYen: number;
  months: string[];
  transactionFiles: string[];
  payrollFile: string | null;
}

async function normalizePublicExpenditureYear(
  fiscalYear: 2024 | 2025 | 2026,
): Promise<PublicYearResult> {
  const directoryName = `fy${fiscalYear}`;
  const sourceDirectory = join(RAW, "public-expenditure", directoryName);
  const outputDirectory = join(NORMALIZED, "public-expenditure", directoryName);
  await ensureDirectory(outputDirectory);
  const files = (await readdir(sourceDirectory))
    .filter((file) => file.endsWith(".csv") || file.endsWith(".xlsx"))
    .sort();
  const payrollFile = files.find((file) => file.startsWith("payroll.")) ?? null;
  const transactionFiles = files.filter((file) => file !== payrollFile);
  const jsonlPath = join(outputDirectory, "transactions.jsonl");
  await rm(jsonlPath, { force: true });
  const outputStream = createWriteStream(jsonlPath, { encoding: "utf8" });

  const byBureau = new Map<string, { key: string; transactionCount: number; amountYen: number }>();
  const byAccount = new Map<string, { key: string; transactionCount: number; amountYen: number }>();
  const byChapter = new Map<string, { key: string; transactionCount: number; amountYen: number }>();
  const monthly = new Map<
    string,
    {
      month: string;
      transactionCount: number;
      transactionAmountYen: number;
      payrollAmountYen: number;
      combinedAmountYen: number;
      ordinaryFileCount: number;
      closingFileCount: number;
    }
  >();
  let transactionCount = 0;
  let transactionAmountYen = 0;
  let invalidDateCount = 0;
  let skippedNonDataRowCount = 0;

  for (const file of transactionFiles) {
    const sourcePath = join(sourceDirectory, file);
    const { rows } = await readTabular(sourcePath);
    const detectedHeaderIndex = rows.findIndex((row) => {
      const normalized = row.map(normalizeHeader);
      return (
        normalized.includes("局名") &&
        normalized.includes("支払日") &&
        normalized.some((value) => value.startsWith("支払額"))
      );
    });
    if (detectedHeaderIndex < 0) throw new Error(`Header not found: ${file}`);
    const headers = rows[detectedHeaderIndex];
    const bureauIndex = headerIndex(headers, (value) => value === "局名");
    const departmentIndex = headerIndex(headers, (value) => value === "部名");
    const sectionIndex = headerIndex(headers, (value) => value === "課名");
    const paidAtIndex = headerIndex(headers, (value) => value === "支払日");
    const accountIndex = headerIndex(headers, (value) => value === "会計名");
    const chapterIndex = headerIndex(headers, (value) => value === "款名");
    const itemIndex = headerIndex(headers, (value) => value === "項名");
    const objectIndex = headerIndex(headers, (value) => value === "目名");
    const subObjectIndex = headerIndex(headers, (value) => value.startsWith("節・細節名"));
    const descriptionIndex = headerIndex(headers, (value) => value.startsWith("支払内容"));
    const amountIndex = headerIndex(headers, (value) => value.startsWith("支払額"));
    const fileKey = basename(file, extname(file));
    const sourceMonth = fileKey.replace(/-closing$/u, "");
    const isClosingPeriod = /closing|suito/i.test(file);

    let fileRecordCount = 0;
    for (let rowIndex = detectedHeaderIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      if (!row || row.every((value) => !cleanCell(value))) continue;
      const amountYen = parseNumber(row[amountIndex]);
      if (amountYen === null) {
        skippedNonDataRowCount += 1;
        continue;
      }
      const paidAt = parseJapaneseEraDate(row[paidAtIndex] ?? "");
      if (!paidAt) invalidDateCount += 1;
      const [expenseSection, expenseSubsection] = splitObjectAndSubObject(
        row[subObjectIndex] ?? "",
      );
      const record: PublicExpenditureRecord = {
        fiscalYear,
        sourceMonth,
        sourceFile: `data/raw/public-expenditure/${directoryName}/${file}`,
        sourceRow: rowIndex + 1,
        paidAt,
        bureau: cleanCell(row[bureauIndex]),
        department: cleanCell(row[departmentIndex]),
        section: cleanCell(row[sectionIndex]),
        account: cleanCell(row[accountIndex]),
        chapter: cleanCell(row[chapterIndex]),
        item: cleanCell(row[itemIndex]),
        object: cleanCell(row[objectIndex]),
        expenseSection,
        expenseSubsection,
        description: cleanCell(row[descriptionIndex]),
        amountYen,
        isClosingPeriod,
      };
      await writeLine(outputStream, record);
      transactionCount += 1;
      fileRecordCount += 1;
      transactionAmountYen += amountYen;
      addAggregate(byBureau, record.bureau, amountYen);
      addAggregate(byAccount, record.account, amountYen);
      addAggregate(byChapter, record.chapter, amountYen);
      const monthAggregate = monthly.get(sourceMonth) ?? {
        month: sourceMonth,
        transactionCount: 0,
        transactionAmountYen: 0,
        payrollAmountYen: 0,
        combinedAmountYen: 0,
        ordinaryFileCount: 0,
        closingFileCount: 0,
      };
      monthAggregate.transactionCount += 1;
      monthAggregate.transactionAmountYen += amountYen;
      monthly.set(sourceMonth, monthAggregate);
    }
    const monthAggregate = monthly.get(sourceMonth) ?? {
      month: sourceMonth,
      transactionCount: 0,
      transactionAmountYen: 0,
      payrollAmountYen: 0,
      combinedAmountYen: 0,
      ordinaryFileCount: 0,
      closingFileCount: 0,
    };
    if (isClosingPeriod) monthAggregate.closingFileCount += 1;
    else monthAggregate.ordinaryFileCount += 1;
    monthly.set(sourceMonth, monthAggregate);
    if (fileRecordCount === 0) throw new Error(`No transaction records found: ${file}`);
  }
  outputStream.end();
  await once(outputStream, "finish");

  const payrollRecords: PayrollRecord[] = [];
  let payrollAmountYen = 0;
  if (payrollFile) {
    const payrollPath = join(sourceDirectory, payrollFile);
    const { rows: payrollRows } = await readTabular(payrollPath);
    const payrollHeaderIndex = payrollRows.findIndex((row) =>
      row.map(normalizeHeader).includes("支払年月"),
    );
    if (payrollHeaderIndex < 0) throw new Error(`Payroll header not found: ${payrollFile}`);
    const payrollHeaders = uniqueHeaders(payrollRows[payrollHeaderIndex]);
    for (let rowIndex = payrollHeaderIndex + 1; rowIndex < payrollRows.length; rowIndex += 1) {
      const row = payrollRows[rowIndex];
      const paidMonth = parseJapaneseEraMonth(row?.[0] ?? "");
      if (!paidMonth) continue;
      for (let columnIndex = 1; columnIndex < payrollHeaders.length; columnIndex += 1) {
        const amountYen = parseNumber(row[columnIndex]);
        if (amountYen === null) continue;
        const record: PayrollRecord = {
          fiscalYear,
          sourceFile: `data/raw/public-expenditure/${directoryName}/${payrollFile}`,
          paidMonth,
          category: cleanCell(payrollHeaders[columnIndex]),
          amountYen,
        };
        payrollRecords.push(record);
        payrollAmountYen += amountYen;
        const monthAggregate = monthly.get(paidMonth) ?? {
          month: paidMonth,
          transactionCount: 0,
          transactionAmountYen: 0,
          payrollAmountYen: 0,
          combinedAmountYen: 0,
          ordinaryFileCount: 0,
          closingFileCount: 0,
        };
        monthAggregate.payrollAmountYen += amountYen;
        monthly.set(paidMonth, monthAggregate);
      }
    }
  }
  for (const monthAggregate of monthly.values()) {
    monthAggregate.combinedAmountYen =
      monthAggregate.transactionAmountYen + monthAggregate.payrollAmountYen;
  }

  const monthSummary = [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month));
  await writeJson(join(outputDirectory, "payroll.json"), {
    fiscalYear,
    sourceFile: payrollFile ? `data/raw/public-expenditure/${directoryName}/${payrollFile}` : null,
    recordCount: payrollRecords.length,
    amountYen: payrollAmountYen,
    records: payrollRecords,
  });
  await writeJson(join(outputDirectory, "by-month.json"), monthSummary);
  await writeJson(join(outputDirectory, "by-bureau.json"), sortedAggregates(byBureau));
  await writeJson(join(outputDirectory, "by-account.json"), sortedAggregates(byAccount));
  await writeJson(join(outputDirectory, "by-chapter.json"), sortedAggregates(byChapter));
  await writeJson(join(outputDirectory, "summary.json"), {
    fiscalYear,
    sourceMonths: [
      ...new Set(
        transactionFiles.map((file) => basename(file, extname(file)).replace(/-closing$/u, "")),
      ),
    ].sort(),
    sourceFiles: transactionFiles,
    transactionFileCount: transactionFiles.length,
    transactionCount,
    transactionAmountYen,
    payrollFile,
    payrollRecordCount: payrollRecords.length,
    payrollAmountYen,
    combinedAmountYen: transactionAmountYen + payrollAmountYen,
    invalidDateCount,
    skippedNonDataRowCount,
    notes: [
      "公金支出の通常明細と給与関係費は別原本であり、別系列として保持した。",
      "出納整理期間はisClosingPeriod=trueで識別できる。",
      "予算系列と公金支出系列は分類粒度が異なるため、この集計だけから執行率を算出しない。",
    ],
  });

  return {
    fiscalYear,
    transactionCount,
    transactionAmountYen,
    payrollAmountYen,
    months: monthSummary.map((entry) => entry.month),
    transactionFiles,
    payrollFile,
  };
}

async function normalizePublicExpenditure(): Promise<PublicYearResult[]> {
  const outputDirectory = join(NORMALIZED, "public-expenditure");
  await rm(outputDirectory, { recursive: true, force: true });
  await ensureDirectory(outputDirectory);
  const results = [
    await normalizePublicExpenditureYear(2024),
    await normalizePublicExpenditureYear(2025),
    await normalizePublicExpenditureYear(2026),
  ];
  await writeJson(
    join(outputDirectory, "index.json"),
    results.map((result) => ({
      fiscalYear: result.fiscalYear,
      transactionCount: result.transactionCount,
      transactionAmountYen: result.transactionAmountYen,
      payrollAmountYen: result.payrollAmountYen,
      months: result.months,
      transactionFileCount: result.transactionFiles.length,
      payrollFile: result.payrollFile,
      path: `data/normalized/public-expenditure/fy${result.fiscalYear}/summary.json`,
    })),
  );
  return results;
}

function normalizeSubsidyRows(
  rows: string[][],
  fiscalYear: 2025 | 2026,
  sourceFile: string,
): SubsidyRecord[] {
  const headers = rows[0].map(normalizeHeader);
  const column = (name: string): number =>
    headers.findIndex((header) => header === normalizeHeader(name));
  const indexes = {
    bureauNo: column("所管局№"),
    bureau: column("所管局"),
    policyAreaNo: column("施策分野№"),
    policyArea: column("施策分野"),
    programName: column("事業名"),
    subsidyName: column("補助金名"),
    summary: column("補助金の概要"),
    recipientNo: column("補助対象者№"),
    recipient: column("補助対象者"),
    budget: headers.findIndex((header) => header.includes("予算額")),
    department: column("所管部署"),
    contact: column("問い合わせ先"),
    url: column("各局HPリンク"),
  };
  const records: SubsidyRecord[] = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row || row.every((value) => !cleanCell(value))) continue;
    records.push({
      fiscalYear,
      bureauNo: cleanCell(row[indexes.bureauNo]),
      bureau: cleanCell(row[indexes.bureau]),
      policyAreaNo: cleanCell(row[indexes.policyAreaNo]),
      policyArea: cleanCell(row[indexes.policyArea]),
      programName: cleanCell(row[indexes.programName]),
      subsidyName: cleanCell(row[indexes.subsidyName]),
      summary: cleanCell(row[indexes.summary]),
      recipientNo: cleanCell(row[indexes.recipientNo]),
      recipient: cleanCell(row[indexes.recipient]),
      budgetThousandYen: parseNumber(row[indexes.budget]),
      department: cleanCell(row[indexes.department]),
      contact: cleanCell(row[indexes.contact]),
      url: cleanCell(row[indexes.url]),
      sourceFile,
      sourceRow: rowIndex + 1,
    });
  }
  return records;
}

function subsidyAggregate(
  records: SubsidyRecord[],
  keyOf: (record: SubsidyRecord) => string,
): { key: string; count: number; budgetThousandYen: number }[] {
  const map = new Map<string, { key: string; count: number; budgetThousandYen: number }>();
  for (const record of records) {
    const key = keyOf(record) || "(空欄)";
    const aggregate = map.get(key) ?? { key, count: 0, budgetThousandYen: 0 };
    aggregate.count += 1;
    aggregate.budgetThousandYen += record.budgetThousandYen ?? 0;
    map.set(key, aggregate);
  }
  return [...map.values()].sort(
    (a, b) => b.budgetThousandYen - a.budgetThousandYen || a.key.localeCompare(b.key, "ja"),
  );
}

async function normalizeSubsidies(): Promise<unknown[]> {
  const outputDirectory = join(NORMALIZED, "subsidies");
  await ensureDirectory(outputDirectory);
  const index: unknown[] = [];
  for (const fiscalYear of [2025, 2026] as const) {
    const file = `hojokin${fiscalYear}.csv`;
    const sourcePath = join(RAW, "subsidies", file);
    const { encoding, rows } = await readCsv(sourcePath);
    const records = normalizeSubsidyRows(rows, fiscalYear, `data/raw/subsidies/${file}`);
    const jsonl = records.map((record) => JSON.stringify(record)).join("\n") + "\n";
    await writeFile(join(outputDirectory, `${fiscalYear}.jsonl`), jsonl, "utf8");
    const totalBudgetThousandYen = records.reduce(
      (sum, record) => sum + (record.budgetThousandYen ?? 0),
      0,
    );
    const summary = {
      fiscalYear,
      sourceFile: `data/raw/subsidies/${file}`,
      sourceEncoding: encoding,
      recordCount: records.length,
      totalBudgetThousandYen,
      byBureau: subsidyAggregate(records, (record) => record.bureau),
      byPolicyArea: subsidyAggregate(records, (record) => record.policyArea),
      byRecipient: subsidyAggregate(records, (record) => record.recipient),
    };
    await writeJson(join(outputDirectory, `${fiscalYear}-summary.json`), summary);
    index.push({
      fiscalYear,
      recordCount: records.length,
      totalBudgetThousandYen,
      jsonlPath: `data/normalized/subsidies/${fiscalYear}.jsonl`,
      summaryPath: `data/normalized/subsidies/${fiscalYear}-summary.json`,
    });
  }
  await writeJson(join(outputDirectory, "index.json"), index);
  return index;
}

async function normalizeClosingEstimate(): Promise<Record<string, unknown>> {
  const outputDirectory = join(NORMALIZED, "closing-estimate");
  await ensureDirectory(outputDirectory);
  const estimate = {
    fiscalYear: 2025,
    status: "preliminary",
    publicationDate: "2026-07-31",
    unit: "億円",
    source: {
      title: "令和7年度一般会計決算（見込み）について",
      url: "https://www.zaimu.metro.tokyo.lg.jp/documents/d/zaimu/20260731_reiwa7nendo_ippankaikeikessan_mikomi_",
      localPath: "data/raw/documents/fy2025/general-account-closing-estimate.pdf",
      page: 1,
    },
    records: [
      {
        metric: "revenue",
        label: "歳入",
        fiscalYear2025HundredMillionYen: 92_960,
        fiscalYear2024HundredMillionYen: 89_628,
        changeHundredMillionYen: 3_332,
        changePercent: 3.7,
      },
      {
        metric: "expenditure",
        label: "歳出",
        fiscalYear2025HundredMillionYen: 90_819,
        fiscalYear2024HundredMillionYen: 87_246,
        changeHundredMillionYen: 3_573,
        changePercent: 4.1,
      },
      {
        metric: "formalBalance",
        label: "形式収支",
        fiscalYear2025HundredMillionYen: 2_141,
        fiscalYear2024HundredMillionYen: 2_382,
        changeHundredMillionYen: null,
        changePercent: null,
      },
      {
        metric: "carryoverResources",
        label: "翌年度へ繰り越すべき財源",
        fiscalYear2025HundredMillionYen: 2_141,
        fiscalYear2024HundredMillionYen: 2_382,
        changeHundredMillionYen: null,
        changePercent: null,
      },
      {
        metric: "realBalance",
        label: "実質収支",
        fiscalYear2025HundredMillionYen: 0,
        fiscalYear2024HundredMillionYen: 0,
        changeHundredMillionYen: null,
        changePercent: null,
      },
    ],
    cautions: [
      "公表値は見込みであり、確定した普通会計決算ではない。",
      "当初予算と決算見込みの単純比率は、補正・繰越・流用・予備費充当後の予算現額を反映しないため、執行率として扱わない。",
      "表示単位未満の四捨五入により、合計等が一致しない場合がある。",
    ],
  };
  await writeJson(join(outputDirectory, "fy2025.json"), estimate);
  return estimate;
}

async function main(): Promise<void> {
  await ensureDirectory(NORMALIZED);
  const budget = await normalizeBudget();
  const settlement = await normalizeSettlement();
  const publicExpenditure = await normalizePublicExpenditure();
  const subsidies = await normalizeSubsidies();
  const closingEstimate = await normalizeClosingEstimate();
  // 執行レビューの概要indexが存在する場合だけ収録状況をcoverageへ載せる（#41）
  let executionReviewCoverage: Record<string, unknown> | null = null;
  try {
    const index = JSON.parse(
      await readFile(join(NORMALIZED, "execution-review/index.json"), "utf8"),
    ) as {
      scope: { account: string };
      scan: { recordCount?: number; total?: number } | null;
      comparisons: { comparableCount: number };
      reviewCandidates: { count: number };
      bureauSummary: { bureauCount: number };
      policyReviews: { status: string; reviewedCount: number };
    };
    executionReviewCoverage = {
      status: "indexed",
      account: index.scope.account,
      fiscalYearPair: [2024, 2026],
      comparableCount: index.comparisons.comparableCount,
      candidateCount: index.reviewCandidates.count,
      bureauCount: index.bureauSummary.bureauCount,
      policyReviewStatus: index.policyReviews.status,
      reviewedCount: index.policyReviews.reviewedCount,
      path: "data/normalized/execution-review/index.json",
    };
  } catch {
    executionReviewCoverage = { status: "not-generated", path: "data/normalized/execution-review/index.json" };
  }
  const coverage = {
    generatedAt: new Date().toISOString(),
    requestedFiscalYears: [2025, 2026],
    budget: {
      seriesCount: budget.length,
      fiscalYears: [2025, 2026],
      status: "complete-for-published-dashboard-series",
    },
    publicExpenditure: Object.fromEntries(
      publicExpenditure.map((entry) => [
        `fiscalYear${entry.fiscalYear}`,
        {
          normalizedMonths: entry.months,
          transactionCount: entry.transactionCount,
          transactionFileCount: entry.transactionFiles.length,
          payrollFile: entry.payrollFile,
          status:
            entry.fiscalYear === 2025
              ? "transactions-through-closing-period; payroll-published-through-2026-01-in-catalog-csv"
              : "published-through-2026-06",
        },
      ]),
    ),
    settlement: {
      seriesCount: settlement.length,
      status: "comparison-data",
      latestFiscalYear: 2024,
    },
    subsidies: {
      fiscalYears: [2025, 2026],
      seriesCount: subsidies.length,
    },
    closingEstimate: {
      fiscalYear: 2025,
      status: "preliminary",
      path: "data/normalized/closing-estimate/fy2025.json",
    },
    executionReview: executionReviewCoverage,
    cautions: [
      "URLのディレクトリ名ではなく、CSV内の年度列を年度判定に使用する。",
      "公金支出明細と予算見える化CSVは分類体系・粒度が一致しないため、未検証の直接結合や執行率計算を避ける。",
      "令和8年度は年度途中であり、執行実績は公開済み月までに限定される。",
    ],
  };
  await writeJson(join(NORMALIZED, "coverage.json"), coverage);
  console.log(
    JSON.stringify({ budget, settlement, publicExpenditure, subsidies, closingEstimate }, null, 2),
  );
}

await main();
