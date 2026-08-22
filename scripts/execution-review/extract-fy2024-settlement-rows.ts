#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractPageTextItems,
  splitEmbeddedAmountItems,
} from "../../src/execution-review/pdf/extract-text-items.ts";
import { filterStructuralRows, groupPageRows } from "../../src/execution-review/settlement/group-page-rows.ts";
import {
  FY2024_EXPENDITURE_PAGE_RANGE,
  SETTLEMENT_DETAIL_HIERARCHY_SPECS,
  SETTLEMENT_DETAIL_SPREAD_BACK_COLUMNS,
  SETTLEMENT_DETAIL_SPREAD_FRONT_COLUMNS,
} from "../../src/execution-review/settlement/page-layouts.ts";
import { createSettlementHierarchyTracker } from "../../src/execution-review/settlement/reconstruct-hierarchy.ts";
import { alignSpreadRows } from "../../src/execution-review/settlement/align-spread-rows.ts";

/**
 * Issue #18: 一般会計歳出ページ全体を中間行JSONLへ変換する。
 * - 歳出の物理ページ範囲はFY2024_EXPENDITURE_PAGE_RANGEの明示的な設定値を使う。
 * - 各見開き（偶数=表 / 奇数=裏）を 座標付きテキスト→行→款・項・目付き行 へ変換する。
 * - 出力: data/normalized/execution-review/fy2024/settlement-rows.jsonl（1行1レコード、ストリーム書き出し）
 * - 金額は円整数へ変換しない。解析不能行はparseStatus:"error"と理由付きで保持する。
 */

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const PDF_PATH =
  "data/raw/execution-review/fy2024/settlement/general-account-settlement-detail.pdf";
const OUTPUT_PATH = "data/normalized/execution-review/fy2024/settlement-rows.jsonl";

const SUBTOTAL_PATTERN = /^(小計|合計|累計|計)$/;
/**
 * 行採用ヒューリスティクス。
 * - 桁区切り付き金額、または単体の「0」（右端揃え表でのゼロ値）を含む行をデータ行とする。
 * - タイトル行（例: 「17 諸支出金」）やヘッダーはコード接頭辞があっても除外する。
 */
const ROW_HEURISTICS = {
  amountPattern: /\d{1,3}(?:,\d{3})+/,
  codePrefixPattern: /^0$/,
} as const;
/** 単位記号のみの項目（表の「円」など）は行グループ化の前に除去する。 */
const UNIT_MARK_PATTERN = /^(?:\u5186|\u5343\u5186)$/u;
const AMOUNT_CELL_PATTERN = /(?:\d{1,3}(?:,\d{3})+)|^\s*(?:\u25b3\s*)?(?:\d{1,3}(?:,\d{3})+|0)\s*\u25b3?\s*$/u;

interface OutputRecord {
  pageNumber: number;
  rowIndex: number;
  parseStatus: "ok" | "error";
  parseErrors: string[];
  warnings: string[];
  kind?: string;
  stableKey?: string | null;
  hierarchy?: unknown;
  cells: Record<string, string>;
  paired: boolean;
}

const pdfPath = resolve(ROOT, PDF_PATH);
const pdfBytes = new Uint8Array(await readFile(pdfPath));

// 再現性のため原本のSHA-256を記録する。
const sha256 = createHash("sha256").update(pdfBytes).digest("hex");

const firstPage = FY2024_EXPENDITURE_PAGE_RANGE.firstPage;
const lastPage = FY2024_EXPENDITURE_PAGE_RANGE.lastPage;

await mkdir(dirname(resolve(ROOT, OUTPUT_PATH)), { recursive: true });
const stream = createWriteStream(resolve(ROOT, OUTPUT_PATH), { encoding: "utf8" });

let rowIndex = 0;
let processedPages = 0;
let errorRowCount = 0;
const errorPages = new Set<number>();

// 階層状態は見開きをまたいで保持する（クロージャ内のみ）。
const tracker = createSettlementHierarchyTracker({
  ...SETTLEMENT_DETAIL_HIERARCHY_SPECS,
  amountPattern: AMOUNT_CELL_PATTERN,
  subtotalPattern: SUBTOTAL_PATTERN,
});

function writeRecord(record: OutputRecord): void {
  stream.write(`${JSON.stringify(record)}\n`);
  if (record.parseStatus === "error") {
    errorRowCount += 1;
    errorPages.add(record.pageNumber);
  }
  rowIndex += 1;
}

for (let frontPage = firstPage; frontPage <= lastPage; frontPage += 2) {
  const backPage = frontPage + 1;
  const hasBack = backPage <= lastPage;
  let frontRows;
  let backRows = [];
  try {
    const [rawFrontItems, rawBackItems] = await Promise.all([
      extractPageTextItems(pdfBytes, frontPage),
      hasBack ? extractPageTextItems(pdfBytes, backPage) : Promise.resolve([]),
    ]);
    // 単位記号のみの項目と、隣接列に取り込まれた金額項目を整理する。
    const frontItems = splitEmbeddedAmountItems(rawFrontItems).filter(
      (item) => !UNIT_MARK_PATTERN.test(item.text),
    );
    const backItems = splitEmbeddedAmountItems(rawBackItems).filter(
      (item) => !UNIT_MARK_PATTERN.test(item.text),
    );
    frontRows = filterStructuralRows(
      groupPageRows(frontItems, { columns: SETTLEMENT_DETAIL_SPREAD_FRONT_COLUMNS }),
      ROW_HEURISTICS,
    );
    backRows = hasBack
      ? filterStructuralRows(
          groupPageRows(backItems, { columns: SETTLEMENT_DETAIL_SPREAD_BACK_COLUMNS }),
          ROW_HEURISTICS,
        )
      : [];
  } catch (error) {
    writeRecord({
      pageNumber: frontPage,
      rowIndex,
      parseStatus: "error",
      parseErrors: [`page-extraction-failed: ${String(error)}`],
      warnings: [],
      cells: {},
      paired: false,
    });
    processedPages += hasBack ? 2 : 1;
    continue;
  }

  processedPages += hasBack ? 2 : 1;
  const mergedRows = alignSpreadRows(frontRows, backRows);
  let annotated;
  try {
    annotated = tracker.annotate(mergedRows.map((row) => ({ ...row, page: frontPage })));
    if (annotated.length !== mergedRows.length) {
      throw new Error(`annotated/merged row count mismatch: ${annotated.length}/${mergedRows.length}`);
    }
    for (const [index, row] of annotated.entries()) {
      const merged = mergedRows[index];
      const errors: string[] = [];
      const warnings: string[] = [];
      if (!merged.paired) warnings.push("unpaired-row");
      if (row.kind === "unclassified") errors.push("unclassified-row");
      writeRecord({
        pageNumber: row.page,
        rowIndex,
        parseStatus: errors.length > 0 ? "error" : "ok",
        parseErrors: errors,
        warnings,
        kind: row.kind,
        stableKey: row.stableKey,
        hierarchy: row.hierarchy,
        cells: row.cells,
        paired: merged.paired,
      });
    }
  } catch (error) {
    // 階層復元のfail-closed例外: 当該見開きを行単位のエラーとして記録する。
    for (const row of mergedRows) {
      writeRecord({
        pageNumber: frontPage,
        rowIndex,
        parseStatus: "error",
        parseErrors: [`hierarchy-failed: ${String(error)}`],
        warnings: [],
        cells: row.cells,
        paired: row.paired,
      });
    }
  }
}

stream.end();
await new Promise((resolvePromise, rejectPromise) =>
  stream.on("finish", resolvePromise).on("error", rejectPromise),
);

console.log(
  JSON.stringify({
    sourceFile: PDF_PATH,
    sourceSha256: sha256,
    targetPages: lastPage - firstPage + 1,
    processedPages,
    totalRecords: rowIndex,
    errorRowCount,
    errorPages: [...errorPages].sort((a, b) => a - b),
  }),
);
