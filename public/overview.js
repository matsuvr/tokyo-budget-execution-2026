import { el } from "./dom.js";
import { formatYen } from "./format.js";
export function renderOverviewCard(index) {
    const attention = index.attentionItems;
    if (attention == null) {
        return el("section", { class: "card overview-card", "aria-label": "年度内執行ギャップ概要" }, el("h2", {}, "概要"), el("p", { class: "empty-note" }, "全明細データは生成中です。旧比較データのみ利用できます。"));
    }
    const operational = attention.totalsByScope.operational;
    const operationalFlags = attention.flagCountsByScope.operational;
    const continued = operationalFlags["budget-continues"] ?? 0;
    const expanded = operationalFlags["budget-expanded"] ?? 0;
    return el("section", { class: "card overview-card", "aria-label": "年度内執行ギャップ概要" }, el("h2", {}, "概要"), el("p", { class: "scope-note" }, "2024年度一般会計の正式決算について、行政サービス・事業の最下位明細（目）を集計しています。"), el("dl", { class: "overview-grid" }, el("dt", {}, "行政サービス・事業の明細数"), el("dd", {}, `${attention.scopeCounts.operational.toLocaleString("ja-JP")} 件`), el("dt", {}, "年度内未執行額"), el("dd", {}, formatYen(operational.yearEndUnexecutedYen)), el("dt", {}, "内訳: 翌年度繰越額"), el("dd", {}, formatYen(operational.carryoverYen)), el("dt", {}, "内訳: 不用額"), el("dd", {}, formatYen(operational.unusedYen)), el("dt", {}, "2026年度比較あり"), el("dd", {}, `${attention.comparisonCounts.attached.toLocaleString("ja-JP")} 件`), el("dt", {}, "2026年度比較未確認"), el("dd", {}, `${attention.comparisonCounts.unavailable.toLocaleString("ja-JP")} 件`), el("dt", {}, "2026年度予算が90%以上継続"), el("dd", {}, `${continued.toLocaleString("ja-JP")} 件（うち増額 ${expanded.toLocaleString("ja-JP")} 件）`)), el("p", { class: "reference-counts" }, `会計・制度上の参考項目 ${attention.scopeCounts["reference-only"].toLocaleString("ja-JP")} 件 ／ 区分要確認 ${attention.scopeCounts.uncertain.toLocaleString("ja-JP")} 件`), el("p", { class: "caution-note" }, "年度内未執行額は翌年度繰越額と不用額の合計です。無駄、人手不足、政策失敗を直接証明する値ではありません。"));
}
