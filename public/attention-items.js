import { el } from "./dom.js";
import { formatRate, formatYen, formatYenExact } from "./format.js";
import { attentionFlagLabel, confidenceLabel, gapCompositionLabel, methodLabel, scopeLabel, } from "./labels.js";
import { renderAttentionDetail } from "./attention-detail.js";
function accountText(item) {
    return [item.accountKey.account, item.accountKey.chapter, item.accountKey.section, item.accountKey.item]
        .filter(Boolean)
        .join(" / ");
}
function breakdownBar(item) {
    const total = item.amounts.currentBudgetYen;
    if (total <= 0)
        return null;
    const segments = [
        { label: "支出済", value: item.amounts.spentYen, className: "bar-spent" },
        { label: "翌年度繰越", value: item.amounts.carryoverYen, className: "bar-carryover" },
        { label: "不用", value: item.amounts.unusedYen, className: "bar-unused" },
    ];
    return el("div", {
        class: "breakdown-bar",
        role: "img",
        "aria-label": segments.map((segment) => `${segment.label} ${formatRate(segment.value / total)}`).join("、"),
    }, ...segments.map((segment) => el("span", {
        class: `bar-segment ${segment.className}`,
        style: `width: ${Math.max(0, Math.min(100, (segment.value / total) * 100)).toFixed(1)}%`,
    })));
}
function detailSection(item, callbacks) {
    const slot = callbacks.getDetailSlot(item);
    const button = el("button", { type: "button", class: "detail-toggle", "aria-expanded": slot.expanded ? "true" : "false" }, slot.expanded ? "詳細を閉じる" : "構成明細・支払内容・確認事項を見る");
    button.addEventListener("click", () => callbacks.onToggleDetail(item));
    return el("div", { class: "detail-section" }, button, slot.expanded && slot.loading ? el("p", { class: "sub" }, "詳細を読み込み中…") : null, slot.expanded && slot.error != null ? el("p", { class: "warning-note", role: "alert" }, slot.error) : null, slot.expanded && slot.data != null ? renderAttentionDetail(slot.data) : null);
}
export function renderAttentionItem(item, callbacks) {
    const comparison = item.comparison;
    const source = el("a", { href: item.source.url, target: "_blank", rel: "noopener noreferrer" }, `${item.source.title}${item.sourcePage == null ? "" : `（PDF物理ページ ${item.sourcePage}）`}`);
    return el("article", { class: `card attention-item scope-${item.reviewScope}` }, el("h3", { class: "candidate-title" }, accountText(item)), el("p", { class: "primary-value" }, el("strong", {}, `年度内未執行額 ${formatYen(item.amounts.yearEndUnexecutedYen)}`), `（${formatRate(item.rates.yearEndUnexecutedRate)}）`), el("p", { class: "sub" }, "翌年度繰越額と不用額の合計"), breakdownBar(item), el("p", { class: "exact-amounts" }, `${formatYenExact(item.amounts.currentBudgetYen)} ＝ 支出済 ${formatYenExact(item.amounts.spentYen)} ＋ 翌年度繰越 ${formatYenExact(item.amounts.carryoverYen)} ＋ 不用 ${formatYenExact(item.amounts.unusedYen)}`), el("div", { class: "badge-list", "aria-label": "確認シグナル" }, ...item.attentionFlags.map((flag) => el("span", { class: "badge" }, attentionFlagLabel(flag)))), el("dl", { class: "candidate-grid" }, el("dt", {}, "表示区分"), el("dd", {}, scopeLabel(item.reviewScope)), el("dt", {}, "局・分野（款）"), el("dd", {}, item.bureau), el("dt", {}, "執行方式"), el("dd", {}, methodLabel(item.executionMethod)), el("dt", {}, "未執行の内訳"), el("dd", {}, gapCompositionLabel(item.gapComposition)), el("dt", {}, "2026年度当初予算"), el("dd", {}, comparison == null ? "比較未確認" : formatYen(comparison.fy2026InitialBudgetYen)), el("dt", {}, "予算継続率"), el("dd", {}, comparison == null ? "比較未確認" : formatRate(comparison.budgetContinuationRate)), el("dt", {}, "年度間対応"), el("dd", {}, comparison == null ? "対応なし／未確認" : `${confidenceLabel(comparison.confidence)}・${comparison.matchLevel}粒度`)), comparison == null
        ? null
        : el("p", { class: "sub" }, "2026年度予算は、この明細を含む款または項の集計値です。明細固有の予算額ではありません。"), el("p", { class: "source-line" }, "原本: ", source), callbacks == null ? null : detailSection(item, callbacks));
}
export function renderAttentionList(records, callbacks, heading = "行政サービス・事業の明細") {
    return el("section", { class: "attention-list", "aria-label": heading }, el("h2", {}, heading), records.length === 0
        ? el("p", { class: "empty-note" }, "条件に一致する明細はありません。")
        : null, ...records.map((record) => renderAttentionItem(record, callbacks)));
}
