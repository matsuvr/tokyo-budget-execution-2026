#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  normalizePdfTextItems,
  type RawPdfTextItem,
} from "../../src/execution-review/pdf/extract-text-items.ts";
import {
  parseBudgetOverviewPage,
} from "../../src/execution-review/budget/fy2024-overview-parser.ts";
import { parseAmountYen } from "../../src/execution-review/settlement/parse-amount.ts";

/**
 * Issue #23: 令和6年度一般会計の当初予算を款・項レベルへ正規化する。
 * - 入力: data/raw/execution-review/fy2024/budget/budget-general-account.pdf
 *   （#12で確定。CSVデータ集はPower BIのみで直接URLが無いためPDFを正とする）
 * - 出力: data/normalized/execution-review/fy2024/initial-budget-lines.json
 * - 単位は千円→円へ換算。欠損を0にしない。同一キー重複を検出する。
 * - 公式の一般会計当初予算総額（8兆4,530億円、億円丸め）との照合をsummaryへ含める。
 */

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const SOURCE_FILE = "data/raw/execution-review/fy2024/budget/budget-general-account.pdf";
const OUTPUT_PATH = "data/normalized/execution-review/fy2024/initial-budget-lines.json";

/** 公式総額（億円丸めの公表値）: 令和6年度一般会計歳出当初予算 8兆4,530億円 */
const OFFICIAL_INITIAL_BUDGET_TOTAL_YEN = 8_453_000_000_000;
/** 公表値の丸め単位（億円）に起因する許容差 */
const OFFICIAL_TOTAL_TOLERANCE_YEN = 50_000_000;

interface BudgetLine {
  fiscalYear: 2024;
  account: string;
  chapter: string;
  section: string | null;
  /** 目。概要は項までしか確認できないため常にnull */
  item: string | null;
  object: string | null;
  level: "kan" | "kou";
  initialBudgetYen: number | null;
  sourceFile: string;
  sourcePage: number;
}

interface WorkingLine extends BudgetLine {
  _column: "left" | "right";
  _assigned: boolean;
}

const pdfBytes = new Uint8Array(await readFile(resolve(ROOT, SOURCE_FILE)));
const doc = await getDocument({ data: pdfBytes, useSystemFonts: false }).promise;

let started = false;
let currentKan: string | null = null;
const workingLines: WorkingLine[] = [];

for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  const items = normalizePdfTextItems(pageNumber, content.items as RawPdfTextItem[]);
  const { headers, amounts } = parseBudgetOverviewPage(pageNumber, items);
  for (const column of ["left", "right"] as const) {
    const events = [
      ...headers.filter((h) => h.column === column).map((h) => ({ type: "header" as const, ...h })),
      ...amounts.filter((a) => a.column === column).map((a) => ({ type: "amount" as const, ...a })),
    ].sort((a, b) => b.y - a.y);
    for (const event of events) {
      if (event.type === "header") {
        // 歳入款(都税など)は除外し、歳出の先頭(第1款議会費)から収集する
        if (!started && !(event.kind === "kan" && event.name === "議会費")) continue;
        started = true;
        if (event.kind === "kan") currentKan = `${event.number}:${event.name}`;
        workingLines.push({
          fiscalYear: 2024,
          account: "一般会計",
          chapter: event.kind === "kan" ? `${event.number}:${event.name}` : (currentKan ?? ""),
          section: event.kind === "kou" ? `${event.number}:${event.name}` : null,
          item: null,
          object: null,
          level: event.kind,
          initialBudgetYen: null,
          sourceFile: SOURCE_FILE,
          sourcePage: pageNumber,
          _column: column,
          _assigned: false,
        });
      } else {
        // 直近の未確定行（同ページ・同列）へ金額を対応付ける
        for (let index = workingLines.length - 1; index >= 0; index -= 1) {
          const candidate = workingLines[index];
          if (
            candidate._assigned ||
            candidate._column !== column ||
            candidate.sourcePage !== pageNumber ||
            candidate.chapter === ""
          ) {
            continue;
          }
          const yen = parseAmountYen(event.currentYearToken, { unit: "thousand-yen" });
          if (yen == null) break; // 金額が解析不能なら対応付けをやめる（0で補完しない）
          candidate.initialBudgetYen = yen;
          candidate._assigned = true;
          break;
        }
      }
    }
  }
}

// 内部フィールドの除去と重複検出。金額未確定行は破棄する（件数はsummaryへ記録）。
const cleanLines: BudgetLine[] = [];
const duplicates: string[] = [];
const seenKeys = new Set<string>();
let unresolvedCount = 0;
for (const line of workingLines) {
  const { _column: _c, _assigned: _a, ...clean } = line;
  if (!Number.isFinite(clean.initialBudgetYen as number) || clean.initialBudgetYen == null) {
    unresolvedCount += 1;
    continue;
  }
  const key = `${clean.chapter}|${clean.section ?? ""}`;
  if (seenKeys.has(key)) {
    duplicates.push(key);
    continue;
  }
  seenKeys.add(key);
  cleanLines.push(clean);
}

const kanLines = cleanLines.filter(
  (line): line is BudgetLine & { initialBudgetYen: number } =>
    line.level === "kan" && line.initialBudgetYen != null,
);
let totalYen = 0n;
for (const line of kanLines) totalYen += BigInt(line.initialBudgetYen);
const differenceFromOfficial = Number(totalYen - BigInt(OFFICIAL_INITIAL_BUDGET_TOTAL_YEN));

await mkdir(dirname(resolve(ROOT, OUTPUT_PATH)), { recursive: true });
const output = {
  fiscalYear: 2024,
  account: "一般会計",
  unit: "円",
  generatedFrom: SOURCE_FILE,
  records: cleanLines,
  summary: {
    lineCount: cleanLines.length,
    kanCount: kanLines.length,
    kouCount: cleanLines.filter((line) => line.level === "kou").length,
    unresolvedLineCount: unresolvedCount,
    duplicateCount: duplicates.length,
    duplicates,
    officialComparison: {
      name: "一般会計 歳出当初予算総額",
      officialYen: OFFICIAL_INITIAL_BUDGET_TOTAL_YEN,
      actualSumYen: Number(totalYen),
      differenceYen: differenceFromOfficial,
      toleranceYen: OFFICIAL_TOTAL_TOLERANCE_YEN,
      pass: Math.abs(differenceFromOfficial) <= OFFICIAL_TOTAL_TOLERANCE_YEN,
      note: "公式値は8兆4,530億円として公表（億円丸め）。原本の款別金額(千円)の合計と照合。",
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
    officialDifferenceYen: differenceFromOfficial,
  }),
);
