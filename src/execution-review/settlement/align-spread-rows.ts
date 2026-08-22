import type { PageRow } from "./group-page-rows.ts";

/**
 * 見開きページ（表・裏）の行をY座標の近さで対応付けて1行へマージする純粋関数（Issue #18）。
 * - 明細書の歳出ページは、表(偶数)に科目と予算現額構成、裏(奇数)に支出済・繰越・不用が印字される。
 * - 同一行はページ間で同じYグリッド上に置かれるため、Y座標の近さで対応付ける。
 */

export interface MergedSpreadRow {
  /** 表ページのY座標（対応付けできた場合）。 */
  y: number;
  cells: Record<string, string>;
  cellX: Record<string, number>;
  /** 表・裏の両方が存在する行か。 */
  paired: boolean;
  sources: ("front" | "back")[];
}

export interface AlignSpreadRowsOptions {
  /** 対応付けとみなすY座標差の上限（PDF単位）。既定値は10。 */
  yTolerance?: number;
}

/**
 * 両ページの行をY降順に走査し、近い行同士を対応付ける。
 * - 片側にのみ存在する行（裏ページの項小計など）は、直後の行との一致が現一致より良い場合に
 *   スキップして単独行として返す。
 * - セル名が衝突した場合は表ページを優先する。入力は変更しない。
 */
export function alignSpreadRows(
  frontRows: readonly PageRow[],
  backRows: readonly PageRow[],
  options: AlignSpreadRowsOptions = {},
): MergedSpreadRow[] {
  const yTolerance = options.yTolerance ?? 10;
  const front = [...frontRows].sort((a, b) => b.y - a.y);
  const back = [...backRows].sort((a, b) => b.y - a.y);
  const merged: MergedSpreadRow[] = [];

  let frontIndex = 0;
  let backIndex = 0;
  while (frontIndex < front.length || backIndex < back.length) {
    const frontRow = front[frontIndex];
    const backRow = back[backIndex];
    if (frontRow && backRow) {
      const distance = Math.abs(frontRow.y - backRow.y);
      if (distance <= yTolerance) {
        // 直後の行と対応付けたほうが良い場合は、現在の片側の行をスキップする。
        const nextFront = front[frontIndex + 1];
        const nextBack = back[backIndex + 1];
        const betterFrontAhead = nextFront != null && Math.abs(nextFront.y - backRow.y) < distance;
        const betterBackAhead = nextBack != null && Math.abs(frontRow.y - nextBack.y) < distance;
        if (betterFrontAhead) {
          merged.push(single("front", frontRow));
          frontIndex += 1;
          continue;
        }
        if (betterBackAhead) {
          merged.push(single("back", backRow));
          backIndex += 1;
          continue;
        }
        merged.push({
          y: frontRow.y,
          cells: { ...backRow.cells, ...frontRow.cells },
          cellX: { ...backRow.cellX, ...frontRow.cellX },
          paired: true,
          sources: ["front", "back"],
        });
        frontIndex += 1;
        backIndex += 1;
        continue;
      }
    }
    if (!backRow || (frontRow && frontRow.y >= backRow.y)) {
      merged.push(single("front", frontRow));
      frontIndex += 1;
    } else {
      merged.push(single("back", backRow));
      backIndex += 1;
    }
  }
  return merged;
}

function single(source: "front" | "back", row: PageRow): MergedSpreadRow {
  return {
    y: row.y,
    cells: { ...row.cells },
    cellX: { ...row.cellX },
    paired: false,
    sources: [source],
  };
}
