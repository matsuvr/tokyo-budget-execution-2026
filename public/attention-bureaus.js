import { el } from "./dom.js";
import { formatRate, formatYen } from "./format.js";
export function renderAttentionBureaus(summary, callbacks) {
    const operational = summary.rows.filter((row) => row.scope === "operational");
    const referenceCount = summary.rows
        .filter((row) => row.scope === "reference-only")
        .reduce((sum, row) => sum + row.itemCount, 0);
    const uncertainCount = summary.rows
        .filter((row) => row.scope === "uncertain")
        .reduce((sum, row) => sum + row.itemCount, 0);
    return el("section", { class: "bureau-section", "aria-label": "局・分野別の年度内執行ギャップ" }, el("h2", {}, "局・分野別サマリー"), el("p", { class: "caution-note" }, "款名を局・分野の表示単位として使用しています。局の能力ランキングではありません。"), el("p", { class: "sub" }, `参考項目 ${referenceCount.toLocaleString("ja-JP")}件 ／ 区分要確認 ${uncertainCount.toLocaleString("ja-JP")}件は主表に含めていません。`), ...operational.map((row) => {
        const button = el("button", { type: "button", class: "bureau-select" }, row.bureau);
        button.addEventListener("click", () => callbacks.onSelectBureau(row.bureau));
        return el("article", { class: "card bureau-card" }, el("h3", {}, button), el("dl", { class: "candidate-grid" }, el("dt", {}, "明細件数"), el("dd", {}, `${row.itemCount.toLocaleString("ja-JP")}件`), el("dt", {}, "予算現額"), el("dd", {}, formatYen(row.amounts.currentBudgetYen)), el("dt", {}, "支出済額"), el("dd", {}, formatYen(row.amounts.spentYen)), el("dt", {}, "年度内執行ギャップ額"), el("dd", {}, `${formatYen(row.amounts.yearEndUnexecutedYen)}（${formatRate(row.rates.yearEndUnexecutedRate)}）`), el("dt", {}, "翌年度継続分"), el("dd", {}, formatYen(row.amounts.carryoverYen)), el("dt", {}, "年度内対応余地"), el("dd", {}, formatYen(row.amounts.unusedYen)), el("dt", {}, "2026年度比較あり"), el("dd", {}, `${row.comparisonAttachedCount.toLocaleString("ja-JP")}件`), el("dt", {}, "2026年度比較未確認"), el("dd", {}, `${row.comparisonUnavailableCount.toLocaleString("ja-JP")}件`), el("dt", {}, "予算90%以上継続"), el("dd", {}, `${(row.flagCounts["budget-continues"] ?? 0).toLocaleString("ja-JP")}件`), el("dt", {}, "予算増額"), el("dd", {}, `${(row.flagCounts["budget-expanded"] ?? 0).toLocaleString("ja-JP")}件`)));
    }));
}
