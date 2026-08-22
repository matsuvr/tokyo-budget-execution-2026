import type { PageColumnLayout } from "./group-page-rows.ts";

/**
 * 決算事項別明細書（一般会計）の列X座標境界の設定値（Issue #15）。
 * - 座標はPDFユーザー空間。代表ページ（物理ページ120・令和6年度一般会計 歳出）で実測した値。
 * - 境界は [xMin, xMax)。
 * - 明細書の歳出ページは見開き2ページで構成される。
 *   - 表(偶数ページ): 左=科目ごとの予算現額構成、右=節別支出済額
 *   - 裏(奇数ページ): 支出済額・翌年度繰越額・不用額の明細（全ページ処理はIssue #18で対応）
 */

/** 歳出表ページ（予算現額構成＋節別支出済額）の列設定。 */
export const SETTLEMENT_DETAIL_EXPENDITURE_FRONT_COLUMNS: readonly PageColumnLayout[] = [
  // 款項目コードと科目名は字間が空くため1つの列として復元し、後段(Issue #17)でコードを分解する。
  { name: "accountAndName", xMin: 85, xMax: 156 },
  { name: "initialBudget", xMin: 156, xMax: 200 },
  { name: "supplementaryBudget", xMin: 200, xMax: 264 },
  { name: "priorYearCarryover", xMin: 264, xMax: 320 },
  { name: "continuingReserveAdjustment", xMin: 320, xMax: 388 },
  { name: "currentBudgetTotal", xMin: 388, xMax: 444 },
  { name: "sectionCode", xMin: 444, xMax: 454 },
  { name: "sectionName", xMin: 454, xMax: 500 },
  { name: "sectionSpentAmount", xMin: 500, xMax: 560 },
];

/**
 * 行として採用する条件を緩く判定するための設定。
 * - amountPattern: 金額らしき文字列（桁区切りあり）
 * - codePrefixPattern: 科目コードで始まる文字列
 */
export const DATA_ROW_HEURISTICS = {
  amountPattern: /\d{1,3}(?:,\d{3})+/,
  codePrefixPattern: /^\d{1,2}/,
} as const;

/** 折り返し科目名を結合する対象の列。 */
export const WRAPPED_NAME_COLUMNS = ["accountAndName", "sectionName"] as const;
