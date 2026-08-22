/**
 * 局別サマリーの並べ替えと整合検証（Issue #51）。
 * Node標準テストから直接読まれるためruntime importを持たないこと。
 */
/** 初期順: 要説明候補件数の降順、同数なら不用額合計の降順 */
export function sortBureausForDisplay(bureaus) {
    return [...bureaus].sort((a, b) => b.needsExplanationCount - a.needsExplanationCount ||
        b.fy2024UnusedYen - a.fy2024UnusedYen ||
        (a.chapter < b.chapter ? -1 : a.chapter > b.chapter ? 1 : 0));
}
/**
 * 局別行を集計した結果が、bureau-summary.json の summary と一致するか検証する純粋関数。
 * UIは独自の再計算値を表示せず、この関数の結果を注意書きに使う。
 */
export function verifyBureauTotals(bureaus, summary) {
    let comparableCount = 0;
    let currentBudgetTotal = 0;
    for (const bureau of bureaus) {
        comparableCount += bureau.comparableCount;
        currentBudgetTotal += bureau.fy2024CurrentBudgetYen;
    }
    const mismatches = [];
    if (comparableCount !== summary.totalComparableCount) {
        mismatches.push(`比較可能件数の合計（${comparableCount}）がsummary（${summary.totalComparableCount}）と一致しません`);
    }
    if (currentBudgetTotal !== summary.totalFy2024CurrentBudgetYen) {
        mismatches.push("予算現額合計がsummaryと一致しません");
    }
    return { consistent: mismatches.length === 0, mismatches };
}
