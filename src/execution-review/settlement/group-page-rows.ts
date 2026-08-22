import type { PdfTextItem } from "../pdf/extract-text-items.ts";

/**
 * 決算事項別明細書の座標付きテキスト項目を表の行へ復元する純粋関数（Issue #15）。
 * - 近いY座標のテキスト項目を同一行へまとめる（Y帯クラスタリング）。
 * - 列はX座標境界の設定値で判定し、設定はこのモジュールの呼び出し側から分離する。
 * - PDFファイルを直接読まない。金額は文字列のまま返す。
 */

export interface PageColumnLayout {
  /** 列ID（出力cellsのキー）。 */
  name: string;
  /** この列へ割り当てる座標の下限（含む）。 */
  xMin: number;
  /** この列へ割り当てる座標の上限（含まない）。 */
  xMax: number;
  /**
   * 判定に使う項目の辺。"left"（既定）は項目の左端、"right"は右端を使う。
   * 右端揃えの金額列は、長短で左端が大きく動くため "right" を使う。
   */
  matchBy?: "left" | "right";
}

export interface GroupPageRowsOptions {
  columns: readonly PageColumnLayout[];
  /** 直前の項目からのY落差がこの値以下なら同一行とみなす（PDF単位）。既定値は6。 */
  maxIntraRowGap?: number;
}

/** 1行ぶんの復元結果。空でないセルのみを保持する。 */
export interface PageRow {
  /** 行のY座標（行内で最初に走査した項目のY）。 */
  y: number;
  /** 列IDごとの文字列。複数項目は結合済み。 */
  cells: Record<string, string>;
  /** 列IDごとの、そのセルに割り当てられた先頭（最も左）項目のX座標。 */
  cellX: Record<string, number>;
}

/**
 * テキスト項目を行へグループ化する。
 * - Y座標を上から走査し、直前項目とのY落差がmaxIntraRowGap以下の項目を同じ行へ連鎖させる。
 *   （折り返し科目名など、主行から数ポイントずれた継続項目も同一行に取り込む）
 * - 行内の項目はX昇順で列に割り当て、同一セル内はX昇順で結合する。
 * - どの列にも属さないX座標の項目、空白のみの項目は破棄する。
 * - 入力は変更しない。出力行は上→下順。金額は文字列のまま。
 */
export function groupPageRows(
  items: readonly PdfTextItem[],
  options: GroupPageRowsOptions,
): PageRow[] {
  const { columns } = options;
  const maxIntraRowGap = options.maxIntraRowGap ?? 6;
  const sorted = [...items]
    .filter((entry) => entry.text.trim().length > 0)
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const bands: PdfTextItem[][] = [];
  let currentBand: PdfTextItem[] | undefined;
  for (const item of sorted) {
    if (
      currentBand &&
      currentBand[currentBand.length - 1].y - item.y <= maxIntraRowGap
    ) {
      currentBand.push(item);
    } else {
      currentBand = [item];
      bands.push(currentBand);
    }
  }

  return bands.map((band) => {
    band.sort((a, b) => a.x - b.x);
    const cells: Record<string, string> = {};
    const cellX: Record<string, number> = {};
    for (const item of band) {
      let column: PageColumnLayout | undefined;
      let matchX = item.x;
      // 左端判定の列を先に探し、見つからなければ右端判定の列へ落とす。
      column = columns.find(
        (layout) =>
          (layout.matchBy ?? "left") === "left" &&
          item.x >= layout.xMin &&
          item.x < layout.xMax,
      );
      if (!column) {
        const rightEdge = round2(item.x + item.width);
        column = columns.find(
          (layout) => layout.matchBy === "right" && rightEdge >= layout.xMin && rightEdge < layout.xMax,
        );
        if (column) matchX = rightEdge;
      }
      if (!column) continue;
      cells[column.name] = (cells[column.name] ?? "") + item.text;
      cellX[column.name] ??= round2(matchX);
    }
    return { y: round2(band[0].y), cells, cellX };
  });
}

/**
 * 折り返された名称行を前の行へ結合する純粋関数。
 * - nameColumnsのどれか1つだけに値を持つ行（継続行）を、直前の行の同列へ後方結合する。
 * - 結合対象が見つからない継続行はそのまま残す（欠損を0で補わないため）。
 */
export function mergeWrappedNameRows(
  rows: readonly PageRow[],
  options: { nameColumns: readonly string[] },
): PageRow[] {
  const merged: PageRow[] = [];
  for (const row of rows) {
    const filledColumns = Object.keys(row.cells).filter((key) => row.cells[key].length > 0);
    const isSingleNameFragment =
      filledColumns.length === 1 && options.nameColumns.includes(filledColumns[0]);
    const previous = merged[merged.length - 1];
    if (isSingleNameFragment && previous && previous.cells[filledColumns[0]]) {
      previous.cells[filledColumns[0]] += row.cells[filledColumns[0]];
      continue;
    }
    merged.push({ y: row.y, cells: { ...row.cells }, cellX: { ...row.cellX } });
  }
  return merged;
}

/**
 * ヘッダー・単位行・ページ番号などの構造行を除外する純粋関数。
 * - 金額パターンまたはコード接頭辞を含む行をデータ行として採用する。
 * - 空行・円のみの行・ページ番号のみの行は必ず除外する。
 */
export interface DataRowHeuristics {
  /** 桁区切り付き金額のパターン（例: /\d{1,3}(?:,\d{3})+/）。 */
  amountPattern: RegExp;
  /** 科目コードで始まる文字列のパターン（例: /^\d{1,2}/）。 */
  codePrefixPattern: RegExp;
}

export function filterStructuralRows(
  rows: readonly PageRow[],
  heuristics: DataRowHeuristics,
): PageRow[] {
  return rows.filter((row) => {
    const texts = Object.values(row.cells);
    if (texts.length === 0) return false;
    const joined = texts.join("");
    // ページ番号（例: "- 112 -"）
    if (/^[\s\p{Pd}]*\d{1,4}[\s\p{Pd}]*$/u.test(joined)) return false;
    // 単位行（例: "円円円"）
    if (/^[\s円千]+$/.test(joined)) return false;
    return texts.some(
      (text) => heuristics.amountPattern.test(text) || heuristics.codePrefixPattern.test(text),
    );
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
