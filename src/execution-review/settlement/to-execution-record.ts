import { parseAmountYen } from "./parse-amount.ts";
import type { ExecutionRecord } from "../types.ts";

/**
 * 中間行JSONLレコードを型付き執行実績へ変換する純粋関数（Issue #19）。
 * - 金額文字列はparseAmountYenで円整数へ変換する。
 * - 欠損・解析不能を0へ変換しない。現額など必須値が確定できない場合はerrorとして返す。
 * - 裏ページのみの小計行は、支出済＋繰越＋不用からの算術復元（原本の恒等式）で現額を補い、
 *   derivedフラグで明示する。
 */

/** settlement-rows.jsonl の1レコードに相当する入力行。 */
export interface IntermediateRow {
  pageNumber: number;
  rowIndex: number;
  parseStatus: string;
  parseErrors?: string[];
  warnings?: string[];
  kind?: string;
  stableKey?: string | null;
  hierarchy?: {
    kan: { code: string; displayName?: string; normalizedName: string } | null;
    kou: { code: string; displayName?: string; normalizedName: string } | null;
    moku: { code: string; displayName?: string; normalizedName: string } | null;
  };
  cells: Record<string, string>;
}

export type ExecutedRowKind = "hierarchy" | "subtotal";

/** ExecutionRecordに加え、行種別と監査用の追加フィールドを持つ出力レコード。 */
export type ExecutionRecordRow = ExecutionRecord & {
  /** 行種別: 階層見出し行 / 裏ページの小計行 */
  rowKind: ExecutedRowKind;
  /** 原本の中間JSONLにおける行識別子 */
  sourceRowIndex: number;
  /** 算術復元したフィールド（原本に直接印字がない場合） */
  derived?: string[];
  /** 表慣習（空欄=0など）を適用したフィールド */
  conventions?: string[];
};

export type ToExecutionRecordResult =
  | { status: "ok"; rowKind: ExecutedRowKind; record: ExecutionRecordRow }
  | { status: "skip"; reason: string }
  | { status: "error"; reason: string };

const SOURCE_TITLE = "令和6年度 一般会計 歳入歳出決算事項別明細書（一般会計）";
const SOURCE_URL =
  "https://www.kaikeikanri.metro.tokyo.lg.jp/documents/d/kaikeikanri/06kessan-2";
const SOURCE_SUMMARY =
  "2024年度一般会計の正式決算。予算現額・支出済額・翌年度繰越額・不用額の原本数値。";

/** 解析不能は例外ではなくエラー結果として返す（fail-closed）。 */
function safeParse(raw: string | undefined): { value: number | null; error?: string } {
  if (raw == null || raw.trim().length === 0) return { value: null };
  try {
    return { value: parseAmountYen(raw) };
  } catch (error) {
    return { value: null, error: `${JSON.stringify(raw)}:${String(error).slice(0, 60)}` };
  }
}

function levelLabel(
  level: { code: string; normalizedName: string } | null | undefined,
): string | null {
  if (!level) return null;
  const name = level.normalizedName.trim();
  return name.length > 0 ? `${level.code}:${name}` : level.code;
}

/**
 * 明細書特有の負号の正規化。
 * 「△」は次の列の数値の前に印字されるが、PDFテキストでは前の数値の文字列に
 * 後置として付着するため、後置△を次の金額セルの接頭辞へ移動する。
 * 例: {a:"5,419,000,000 △", b:"104,528,000"} → {a:"5,419,000,000", b:"△104,528,000"}
 */
export function normalizeTrailingNegativeSigns(
  cells: Record<string, string>,
  orderedColumns: readonly string[],
): Record<string, string> {
  const result = { ...cells };
  for (let index = 0; index < orderedColumns.length - 1; index += 1) {
    const current = orderedColumns[index];
    const next = orderedColumns[index + 1];
    const currentText = result[current];
    if (currentText == null || !/^\S.*\s+△$/u.test(currentText)) continue;
    const nextText = result[next];
    if (nextText == null || nextText.trim().length === 0) continue;
    result[current] = currentText.replace(/\s+△$/u, "");
    result[next] = /^△/u.test(nextText.trim()) ? nextText : `△${nextText.trim()}`;
  }
  return result;
}

/** 金額列の原本上の並び順（負号移動の対象）。 */
export const AMOUNT_COLUMN_ORDER = [
  "initialBudget",
  "supplementaryBudget",
  "priorYearCarryover",
  "continuingReserveAdjustment",
  "currentBudgetTotal",
  "spentAmount",
  "carryoverContinuingFee",
  "carryoverAuthorized",
  "carryoverSuccessive",
  "unusedAmount",
] as const;

/**
 * 中間行1件を執行実績へ変換する。
 */
export function toExecutionRecord(row: IntermediateRow): ToExecutionRecordResult {
  if (row.parseStatus !== "ok") {
    return { status: "error", reason: `parseStatus=${row.parseStatus}` };
  }
  if (row.kind !== "kan" && row.kind !== "kou" && row.kind !== "moku" && row.kind !== "subtotal") {
    // 節別明細行など、款・項・目単位の出力対象外。
    return { status: "skip", reason: `kind=${row.kind ?? "undefined"}` };
  }
  const hierarchy = row.hierarchy;
  if (!hierarchy?.kan) {
    return { status: "error", reason: "hierarchy-incomplete" };
  }
  // 行種別ごとに要求する階層の深さ: 款=1 / 項=2 / 目・小計=3以上。
  const requiredDepth =
    row.kind === "kan" ? 1 : row.kind === "kou" ? 2 : row.kind === "subtotal" ? 1 : 3;
  const depth = (hierarchy.kan ? 1 : 0) + (hierarchy.kou ? 1 : 0) + (hierarchy.moku ? 1 : 0);
  if (depth < requiredDepth || depth > 3) {
    return { status: "error", reason: "hierarchy-incomplete" };
  }

  // 負号(△)の正規化: 後置△を次の金額セルの接頭辞へ移動する。
  const cells = normalizeTrailingNegativeSigns(row.cells, AMOUNT_COLUMN_ORDER);
  const derived: string[] = [];
  const recordConventions: string[] = [];
  const parseErrors: string[] = [];
  function parseField(name: string): number | null {
    const parsed = safeParse(cells[name]);
    if (parsed.error != null) parseErrors.push(`${name}=${parsed.error}`);
    return parsed.value;
  }
  const initialBudgetYen = parseField("initialBudget");
  const currentBudgetPrinted = parseField("currentBudgetTotal");
  const spentPrinted = parseField("spentAmount");
  const unusedPrinted = parseField("unusedAmount");

  // 他の列に印字があるか（空欄=0慣習を適用できる条件）。
  const hasAnyOtherAmount =
    [initialBudgetYen, currentBudgetPrinted, unusedPrinted, spentPrinted].some(
      (value) => value != null,
    );

  // 翌年度繰越額は継続費／繰越明許費／逓次繰越の3列の合計。
  // 印字のある列で解析不能ならエラー、印字なし（空欄）は表慣習どおり0として扱う。
  let carryoverYen = 0;
  let carryoverPrinted = false;
  for (const column of [
    "carryoverContinuingFee",
    "carryoverAuthorized",
    "carryoverSuccessive",
  ] as const) {
    const raw = cells[column];
    if (raw == null || raw.trim().length === 0) {
      if (hasAnyOtherAmount) recordConventions.push(`blank-as-zero:${column}`);
      continue;
    }
    let value: number | null;
    try {
      value = parseAmountYen(raw);
    } catch {
      return { status: "error", reason: `unparseable:${column}=${JSON.stringify(raw)}` };
    }
    if (value != null) {
      carryoverYen += value;
      carryoverPrinted = true;
    }
  }

  // 空欄=0の表慣習: 行内に他の印字金額がある場合のみ、空欄の支出済・不用を0とみなす。
  // 他に何も印字がない行では0へ補完せずエラーとして残す（fail-closed）。
  const conventions: string[] = [];
  if (hasAnyOtherAmount) {
    if (spentPrinted == null) {
      conventions.push("blank-as-zero:spentAmount");
    }
    if (unusedPrinted == null) {
      conventions.push("blank-as-zero:unusedAmount");
    }
  }

  const spentYen = spentPrinted ?? (hasAnyOtherAmount ? 0 : null);
  const unusedYen = unusedPrinted ?? (hasAnyOtherAmount ? 0 : null);

  const mandatoryErrors: string[] = [];
  if (currentBudgetPrinted == null && (spentYen == null || unusedYen == null)) {
    mandatoryErrors.push("missing-currentBudgetTotal");
  }
  if (spentYen == null) mandatoryErrors.push("missing-spentAmount");
  if (unusedYen == null) mandatoryErrors.push("missing-unusedAmount");
  if (!carryoverPrinted && currentBudgetPrinted == null) mandatoryErrors.push("missing-carryover");
  if (parseErrors.length > 0) {
    return { status: "error", reason: `unparseable:${parseErrors.join(";")}` };
  }
  if (mandatoryErrors.length > 0) {
    return { status: "error", reason: mandatoryErrors.join(",") };
  }

  // 現額が印字されていない小計行は恒等式（現額=支出済+繰越+不用）から算術復元する。
  let currentBudgetYen: number;
  if (currentBudgetPrinted != null) {
    currentBudgetYen = currentBudgetPrinted;
  } else {
    currentBudgetYen = (spentYen as number) + carryoverYen + (unusedYen as number);
    derived.push("currentBudgetYen");
  }
  if (conventions.length > 0) recordConventions.push(...conventions);

  const chapter = levelLabel(hierarchy.kan);
  const section = levelLabel(hierarchy.kou);
  const item = levelLabel(hierarchy.moku);

  const record: ExecutionRecordRow = {
    fiscalYear: 2024,
    // 明細書は局名を印字しないため空文字とし、政策レビュー(Issue #35)で対応付ける。
    bureau: "",
    accountKey: {
      account: "一般会計",
      chapter: chapter ?? "",
      section: section ?? "",
      item: item ?? "",
      key: `一般会計:${chapter ?? ""}:${section ?? ""}:${item ?? ""}`,
    },
    initialBudgetYen,
    currentBudgetYen,
    spentYen: spentYen as number,
    carryoverYen,
    unusedYen: unusedYen as number,
    sourcePage: row.pageNumber,
    source: {
      title: SOURCE_TITLE,
      url: SOURCE_URL,
      page: row.pageNumber,
      summary: SOURCE_SUMMARY,
    },
    executionMethod: "unknown",
    rowKind: row.kind === "subtotal" ? "subtotal" : "hierarchy",
    sourceRowIndex: row.rowIndex,
  };
  if (derived.length > 0) record.derived = derived;
  if (recordConventions.length > 0) record.conventions = recordConventions;
  return { status: "ok", rowKind: record.rowKind, record };
}
