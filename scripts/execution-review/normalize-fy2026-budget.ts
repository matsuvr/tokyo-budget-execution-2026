#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  parseBudgetBillExpenditure,
} from "../../src/execution-review/budget/fy2026-bill-parser.ts";

/**
 * Issue #24: 令和8年度一般会計の当初予算を款・項レベルへ正規化する。
 * - 入力: data/raw/execution-review/fy2026/budget/budget-bill.pdf
 *   （議案第1号 令和8年度東京都一般会計予算。#12で確定した概要・計数表は
 *     数字グリフのToUnicodeが欠落しておりテキスト抽出できないため、
 *     正式議案を正とする）
 * - テキスト抽出には poppler の pdftotext を使う（-layout）。
 * - 出力: data/normalized/execution-review/fy2026/initial-budget-lines.json
 * - #23と同じ出力契約。単位は千円→円。局名は原文を保持し置換しない。
 */

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const SOURCE_FILE = "data/raw/execution-review/fy2026/budget/budget-bill.pdf";
const OUTPUT_PATH = "data/normalized/execution-review/fy2026/initial-budget-lines.json";

interface BudgetLine {
  fiscalYear: 2026;
  account: string;
  chapter: string;
  section: string | null;
  item: string | null;
  object: string | null;
  bureauOriginal: null;
  level: "kan" | "kou";
  initialBudgetYen: number;
  sourceFile: string;
  sourcePage: number | null;
}

const execFileAsync = promisify(execFile);
let pdfText: string;
try {
  const { stdout } = await execFileAsync("pdftotext", [
    "-layout",
    resolve(ROOT, SOURCE_FILE),
    "-",
  ]);
  pdfText = stdout;
} catch (error) {
  console.error("pdftotext(poppler)が必要です。brew install poppler を実行してください。");
  console.error(String(error));
  process.exit(1);
}

const declaredTotalThousandYen = extractDeclared(pdfText);
function extractDeclared(text: string): number | null {
  const match = text.replace(/\s+/gu, "").match(/それぞれ([0-9,]+)千(?:円|圓)/u);
  return match?.[1] != null ? Number.parseInt(match[1].replace(/,/gu, ""), 10) : null;
}

const parseResult = parseBudgetBillExpenditure(pdfText);

// 款→項の親子付けと検証
const records: BudgetLine[] = [];
const duplicates: string[] = [];
const seenKeys = new Set<string>();
const reconciliation: { chapter: string; kanYen: number; kouSumYen: number | null; pass: boolean }[] = [];
let currentKan: { number: string; name: string; yen: number } | null = null;
let kouSum = 0n;
let kouCount = 0;

function flushKou(): void {
  if (currentKan == null) return;
  const pass = kouSum === BigInt(currentKan.yen);
  reconciliation.push({
    chapter: `${currentKan.number}:${currentKan.name}`,
    kanYen: currentKan.yen,
    kouSumYen: kouCount > 0 ? Number(kouSum) : null,
    pass,
  });
}

for (const line of parseResult.lines) {
  if (line.level === "kan") {
    flushKou();
    currentKan = { number: line.number, name: line.name, yen: line.initialBudgetYen };
    kouSum = 0n;
    kouCount = 0;
    const key = `${line.number}:${line.name}`;
    if (seenKeys.has(key)) duplicates.push(key);
    seenKeys.add(key);
    records.push({
      fiscalYear: 2026,
      account: "一般会計",
      chapter: key,
      section: null,
      item: null,
      object: null,
      // 組織再編後の局名は原文に依存するため本ファイルでは保持しない（null）
      bureauOriginal: null,
      level: "kan",
      initialBudgetYen: line.initialBudgetYen,
      sourceFile: SOURCE_FILE,
      sourcePage: null,
    });
  } else {
    kouSum += BigInt(line.initialBudgetYen);
    kouCount += 1;
    if (currentKan == null) continue;
    const key = `${currentKan.number}:${currentKan.name}|${line.number}:${line.name}`;
    if (seenKeys.has(key)) duplicates.push(key);
    seenKeys.add(key);
    records.push({
      fiscalYear: 2026,
      account: "一般会計",
      chapter: `${currentKan.number}:${currentKan.name}`,
      section: `${line.number}:${line.name}`,
      item: null,
      object: null,
      bureauOriginal: null,
      level: "kou",
      initialBudgetYen: line.initialBudgetYen,
      sourceFile: SOURCE_FILE,
      sourcePage: null,
    });
  }
}
flushKou();

const totalYen = records
  .filter((record) => record.level === "kan")
  .reduce((sum, record) => sum + BigInt(record.initialBudgetYen), 0n);
const officialDifference =
  declaredTotalThousandYen != null
    ? Number(totalYen - BigInt(declaredTotalThousandYen) * 1000n)
    : null;

await mkdir(dirname(resolve(ROOT, OUTPUT_PATH)), { recursive: true });
const output = {
  fiscalYear: 2026,
  account: "一般会計",
  unit: "円",
  generatedFrom: SOURCE_FILE,
  note: "数字グリフのToUnicodeが欠落しているため、正式議案PDFからpoppler(pdftotext)で抽出した。",
  records,
  summary: {
    lineCount: records.length,
    kanCount: records.filter((record) => record.level === "kan").length,
    kouCount: records.filter((record) => record.level === "kou").length,
    duplicateCount: duplicates.length,
    duplicates,
    kouReconciliationFailures: reconciliation.filter((entry) => !entry.pass),
    officialComparison: {
      name: "一般会計 歳入歳出予算総額（総則 第1条、歳出分）",
      officialYen:
        declaredTotalThousandYen != null ? declaredTotalThousandYen * 1000 : null,
      actualSumYen: Number(totalYen),
      differenceYen: officialDifference,
      toleranceYen: 0,
      pass: officialDifference === 0,
    },
  },
};
await writeFile(resolve(ROOT, OUTPUT_PATH), `${JSON.stringify(output, null, 1)}\n`, "utf8");

console.log(
  JSON.stringify({
    output: OUTPUT_PATH,
    ...output.summary,
    officialComparison: undefined,
    totalYen: Number(totalYen),
    officialDifferenceYen: officialDifference,
  }),
);
