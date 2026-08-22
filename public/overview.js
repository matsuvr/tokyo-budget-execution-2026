import { el } from "./dom.js";
import { formatYen, sumAmountsByStatus } from "./format.js";
/**
 * 概要カード（Issue #48）。
 * 「2024年度正式決算と2026年度当初予算の比較」であることを明示し、
 * 対象規模と要説明候補の金額規模を表示する。
 */
function thresholdSummary(thresholds) {
    const unused = thresholds["needsUnusedRate"];
    const minBudget = thresholds["needsMinCurrentBudgetYen"];
    const continuation = thresholds["needsBudgetContinuationRate"];
    const parts = [];
    if (unused != null)
        parts.push(`不用率${Math.round(unused * 1000) / 10}%以上`);
    if (minBudget != null)
        parts.push(`予算現額${formatYen(minBudget)}以上`);
    if (continuation != null)
        parts.push(`予算継続率${Math.round(continuation * 1000) / 10}%以上`);
    return parts.join(" ＆ ");
}
export function renderOverviewCard(index, candidates) {
    const needsCount = index.reviewCandidates.byStatus["needs-explanation"] ?? 0;
    const sums = sumAmountsByStatus(candidates.records, "needs-explanation");
    return el("section", { class: "card overview-card", "aria-label": "執行レビュー概要" }, el("h2", {}, "概要"), el("p", { class: "scope-note" }, "2024年度（令和6年度）一般会計の正式決算と、2026年度（令和8年度）当初予算の比較です。"), el("dl", { class: "overview-grid" }, el("dt", {}, "比較可能な科目数"), el("dd", {}, `${index.comparisons.comparableCount.toLocaleString("ja-JP")} 件`), el("dt", {}, "要説明候補の件数"), el("dd", {}, `${needsCount.toLocaleString("ja-JP")} 件`, el("span", { class: "sub" }, `（比較可能 ${index.reviewCandidates.count.toLocaleString("ja-JP")} 件中）`)), el("dt", {}, "要説明候補の2024年度不用額合計"), el("dd", {}, formatYen(sums.unusedYenTotal)), el("dt", {}, "要説明候補の2026年度当初予算額合計"), el("dd", {}, formatYen(sums.fy2026InitialTotal)), el("dt", {}, "重点レビュー件数"), el("dd", {}, `${index.policyReviews.reviewedCount.toLocaleString("ja-JP")} 件`, el("span", { class: "sub" }, index.policyReviews.status === "ready"
        ? "（公式資料レビュー済み）"
        : "（詳細は未生成）"))), el("p", { class: "threshold-note" }, "初期スクリーニング条件（検索条件であり評価ではありません）: ", thresholdSummary(index.reviewCandidates.thresholds)), el("p", { class: "caution-note" }, "執行率・不用率は数値の特徴を示すものであり、政策の成果や局の能力を評価する値ではありません。"));
}
