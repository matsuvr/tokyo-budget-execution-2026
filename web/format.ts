/**
 * 表示用整形関数（Issue #48）。
 * 円データ・率データは表示時にだけ文字列へ整形し、元の数値は変更しない。
 * 欠損値は0とみなさず「確認不能」と表示する。
 */

/** 円→「X.X兆円」「X億円」「X万円」「X円」。欠損・非数は確認不能 */
export function formatYen(yen: number | null | undefined): string {
  if (yen == null || !Number.isFinite(yen)) return "確認不能";
  const abs = Math.abs(yen);
  const sign = yen < 0 ? "△" : "";
  if (abs >= 1e12) {
    const trillions = Math.round((abs / 1e12) * 100) / 100;
    return `${sign}${trillions.toLocaleString("ja-JP")}兆円`;
  }
  if (abs >= 1e8) {
    const oku = Math.round((abs / 1e8) * 10) / 10;
    return `${sign}${oku.toLocaleString("ja-JP")}億円`;
  }
  if (abs >= 1e4) {
    return `${sign}${Math.round(abs / 1e4).toLocaleString("ja-JP")}万円`;
  }
  return `${sign}${yen.toLocaleString("ja-JP")}円`;
}

/** 率(小数)→「XX.X%」。欠損・非数は確認不能 */
export function formatRate(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return "確認不能";
  const percent = Math.round(rate * 1000) / 10;
  return `${percent.toLocaleString("ja-JP", { minimumFractionDigits: 1 })}%`;
}

/** 金額を整数カン区切りで表示（欠損は確認不能） */
export function formatYenExact(yen: number | null | undefined): string {
  if (yen == null || !Number.isFinite(yen)) return "確認不能";
  return `${yen.toLocaleString("ja-JP")}円`;
}

export interface AmountRecordLike {
  status: string;
  amounts: {
    fy2024UnusedYen: number | null;
    fy2026InitialBudgetYen: number | null;
  };
}

/**
 * 指定statusの候補について不用額・2026年度当初予算額の合計を計算する純粋関数。
 * 欠損行は合計から除外し、件数として返す（0で補わない）。
 */
export function sumAmountsByStatus(
  records: readonly AmountRecordLike[],
  status: string,
): { unusedYenTotal: number; fy2026InitialTotal: number; matchedCount: number; nullAmountCount: number } {
  let unusedYenTotal = 0;
  let fy2026InitialTotal = 0;
  let matchedCount = 0;
  let nullAmountCount = 0;
  for (const record of records) {
    if (record.status !== status) continue;
    matchedCount += 1;
    const { fy2024UnusedYen, fy2026InitialBudgetYen } = record.amounts;
    if (fy2024UnusedYen != null && Number.isFinite(fy2024UnusedYen)) {
      unusedYenTotal += fy2024UnusedYen;
    }
    if (fy2026InitialBudgetYen != null && Number.isFinite(fy2026InitialBudgetYen)) {
      fy2026InitialTotal += fy2026InitialBudgetYen;
    }
    if (fy2024UnusedYen == null || fy2026InitialBudgetYen == null) nullAmountCount += 1;
  }
  return { unusedYenTotal, fy2026InitialTotal, matchedCount, nullAmountCount };
}
