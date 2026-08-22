import type { PageRow } from "./group-page-rows.ts";

/**
 * 決算表の款・項・目階層を復元する純粋関数（Issue #17）。
 * - 入力はページ番号付きの行配列。出力は各行に現在の款・項・目を付与した配列。
 * - ページをまたいで直前の款・項が継続する場合に対応する（状態は引数内のみで保持する）。
 * - レベル判定の根拠は列位置（cellX）とコードパターンのみ。名称の意味は使わない。
 * - 小計・計・合計行は見出しパターンで通常の目行と区別する。
 * - 不明な階層を直前値で無条件補完しない: 見出し欠損時は該当行の階層をnullとして残す。
 */

export type SettlementRowKind = "kan" | "kou" | "moku" | "subtotal" | "data" | "unclassified";

/** 階層レベルごとの列配置設定。 */
export interface HierarchyLevelSpec {
  /** コードが現れるセル名。純粋な2桁コードまたは「コード+名称」の結合セル。 */
  codeColumn: string;
  /** 名称が現れるセル名（優先順）。 */
  nameColumns: readonly string[];
}

export interface ReconstructHierarchyOptions {
  kan: HierarchyLevelSpec;
  kou: HierarchyLevelSpec;
  moku: HierarchyLevelSpec;
  /** 数値行の判定パターン（いずれかのセル値に部分一致）。 */
  amountPattern?: RegExp;
  /** 小計・合計系の見出しパターン（正規化名称に対する全体一致）。 */
  subtotalPattern?: RegExp;
}

export interface HierarchyLevelContext {
  code: string;
  /** 原文の名称（空白を保持）。 */
  displayName: string;
  /** 空白・全角空白を除去した正規化名称。 */
  normalizedName: string;
}

export type HierarchyContext = Record<"kan" | "kou" | "moku", HierarchyLevelContext | null>;

export interface AnnotatedSettlementRow<TCells extends Record<string, string> = Record<string, string>> {
  page: number;
  cells: TCells;
  kind: SettlementRowKind;
  hierarchy: HierarchyContext;
  /** 款・項・目がすべて確定している場合のみ非null。 */
  stableKey: string | null;
}

const CODE_ONLY_PATTERN = /^\d{1,2}$/;
const LEADING_CODE_PATTERN = /^(\d{1,2})\s*(.*)$/s;

function normalizeName(name: string): string {
  return name.replace(/\s+/gu, "");
}

function extractLevel(
  spec: HierarchyLevelSpec,
  cells: Record<string, string>,
): HierarchyLevelContext | null {
  const codeText = (cells[spec.codeColumn] ?? "").trim();
  let code: string;
  let displayParts: string[];
  if (CODE_ONLY_PATTERN.test(codeText)) {
    code = codeText;
    displayParts = spec.nameColumns.map((column) => cells[column] ?? "");
  } else {
    // コードと名称が結合して現れるケース（例: 目コード列に「01総務管理費」）。
    const match = codeText.match(LEADING_CODE_PATTERN);
    if (!match) return null;
    code = match[1];
    displayParts = [match[2] ?? "", ...spec.nameColumns.map((column) => cells[column] ?? "")];
  }
  const displayName = displayParts.join("");
  return {
    code,
    displayName,
    normalizedName: normalizeName(displayName),
  };
}

function levelKey(level: HierarchyLevelContext): string {
  return `${level.code}:${level.normalizedName}`;
}

/**
 * 行配列から款・項・目の階層を復元する。
 * - 入力順序を保ち、状態はこの関数のローカルでのみ持つ。
 * - 数値行・小計行には現在の階層を付与する。階層が未確定ならnullを残す（fail-closed）。
 */
export function reconstructHierarchy<const TCells extends Record<string, string>>(
  rows: readonly (PageRow & { page: number; cells: TCells })[],
  options: ReconstructHierarchyOptions,
): AnnotatedSettlementRow<TCells>[] {
  let currentKan: HierarchyLevelContext | null = null;
  let currentKou: HierarchyLevelContext | null = null;
  let currentMoku: HierarchyLevelContext | null = null;

  return rows.map((row) => {
    // レベル判定はコードセルの内容のみで行う（先勝り）。
    const kan = extractLevel(options.kan, row.cells);
    const kou = kan ? null : extractLevel(options.kou, row.cells);
    const moku = kan || kou ? null : extractLevel(options.moku, row.cells);

    if (kan) {
      currentKan = kan;
      currentKou = null;
      currentMoku = null;
    } else if (kou) {
      if (!currentKan) {
        throw new Error(`項が款に先行しています: page=${row.page} cells=${JSON.stringify(row.cells)}`);
      }
      currentKou = kou;
      currentMoku = null;
    } else if (moku) {
      if (!currentKan || !currentKou) {
        throw new Error(`目が款・項に先行しています: page=${row.page} cells=${JSON.stringify(row.cells)}`);
      }
      currentMoku = moku;
    }

    const amountPattern = options.amountPattern;
    const hasAmounts =
      amountPattern != null &&
      Object.values(row.cells).some((value) => amountPattern.test(value));
    // 小計判定はセル単位（金額セルと結合しない）。
    const subtotalPattern = options.subtotalPattern;
    const isSubtotal =
      subtotalPattern != null &&
      Object.values(row.cells).some((value) => {
        const normalizedValue = normalizeName(value);
        return normalizedValue.length > 0 && subtotalPattern.test(normalizedValue);
      });
    let kind: SettlementRowKind;
    if (kan) kind = "kan";
    else if (kou) kind = "kou";
    else if (moku) kind = "moku";
    else if (isSubtotal) {
      kind = "subtotal";
    } else if (hasAmounts) {
      kind = "data";
    } else {
      kind = "unclassified";
    }

    const hierarchy: HierarchyContext =
      kind === "unclassified"
        ? { kan: null, kou: null, moku: null }
        : { kan: currentKan, kou: currentKou, moku: currentMoku };
    const stableKey =
      hierarchy.kan && hierarchy.kou && hierarchy.moku
        ? [hierarchy.kan, hierarchy.kou, hierarchy.moku].map((level) => levelKey(level)).join("/")
        : null;

    return { page: row.page, cells: row.cells, kind, hierarchy, stableKey };
  });
}
