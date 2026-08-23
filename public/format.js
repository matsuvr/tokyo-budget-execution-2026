export function formatYen(yen) {
    if (yen == null || !Number.isFinite(yen))
        return "確認不能";
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
    if (abs >= 1e4)
        return `${sign}${Math.round(abs / 1e4).toLocaleString("ja-JP")}万円`;
    return `${sign}${yen.toLocaleString("ja-JP")}円`;
}
export function formatRate(rate) {
    if (rate == null || !Number.isFinite(rate))
        return "確認不能";
    const percent = Math.round(rate * 1000) / 10;
    return `${percent.toLocaleString("ja-JP", { minimumFractionDigits: 1 })}%`;
}
export function formatYenExact(yen) {
    if (yen == null || !Number.isFinite(yen))
        return "確認不能";
    return `${yen.toLocaleString("ja-JP")}円`;
}
export function sumAmountsByStatus(records, status) {
    let unusedYenTotal = 0;
    let fy2026InitialTotal = 0;
    let matchedCount = 0;
    let nullAmountCount = 0;
    for (const record of records) {
        if (record.status !== status)
            continue;
        matchedCount += 1;
        const { fy2024UnusedYen, fy2026InitialBudgetYen } = record.amounts;
        if (fy2024UnusedYen != null && Number.isFinite(fy2024UnusedYen))
            unusedYenTotal += fy2024UnusedYen;
        if (fy2026InitialBudgetYen != null && Number.isFinite(fy2026InitialBudgetYen))
            fy2026InitialTotal += fy2026InitialBudgetYen;
        if (fy2024UnusedYen == null || fy2026InitialBudgetYen == null)
            nullAmountCount += 1;
    }
    return { unusedYenTotal, fy2026InitialTotal, matchedCount, nullAmountCount };
}
