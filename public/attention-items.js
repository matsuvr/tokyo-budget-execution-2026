import { el } from "./dom.js";
import { formatRate, formatYen, formatYenExact } from "./format.js";
import { attentionFlagLabel, gapCompositionLabel, } from "./labels.js";
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
        { label: "翌年度継続", value: item.amounts.carryoverYen, className: "bar-carryover" },
        { label: "年度内対応余地", value: item.amounts.unusedYen, className: "bar-unused" },
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
    const button = el("button", { type: "button", class: "detail-toggle", "aria-expanded": slot.expanded ? "true" : "false" }, slot.expanded ? "詳細を閉じる" : "詳細を見る");
    button.addEventListener("click", () => callbacks.onToggleDetail(item));
    return el("div", { class: "detail-section" }, button, slot.expanded && slot.loading ? el("p", { class: "sub" }, "詳細を読み込み中…") : null, slot.expanded && slot.error != null ? el("p", { class: "warning-note", role: "alert" }, slot.error) : null, slot.expanded && slot.data != null ? renderAttentionDetail(slot.data) : null);
}
export function renderAttentionItem(item, callbacks) {
    const comparison = item.comparison;
    const source = el("a", { href: item.source.url, target: "_blank", rel: "noopener noreferrer" }, `${item.source.title}${item.sourcePage == null ? "" : `（PDF物理ページ ${item.sourcePage}）`}`);
    const visibleFlags = item.attentionFlags.filter((flag) => flag !== "cross-year-comparison-unavailable");
    const extraRows = [];
    if (item.gapComposition !== "unavailable") {
        extraRows.push(el("dt", {}, "執行ギャップの内訳"), el("dd", {}, gapCompositionLabel(item.gapComposition)));
    }
    if (comparison?.fy2026InitialBudgetYen != null) {
        extraRows.push(el("dt", {}, "2026年度当初予算"), el("dd", {}, formatYen(comparison.fy2026InitialBudgetYen)));
    }
    if (comparison?.budgetContinuationRate != null) {
        extraRows.push(el("dt", {}, "予算継続率"), el("dd", {}, formatRate(comparison.budgetContinuationRate)));
    }
    return el("article", { class: `card attention-item scope-${item.reviewScope}` }, el("h3", { class: "candidate-title" }, accountText(item)), el("p", { class: "primary-value" }, el("strong", {}, `年度内執行ギャップ額 ${formatYen(item.amounts.yearEndUnexecutedYen)}`), `（${formatRate(item.rates.yearEndUnexecutedRate)}）`), el("p", { class: "sub" }, "翌年度継続分と年度内対応余地の合計"), breakdownBar(item), el("p", { class: "exact-amounts" }, `${formatYenExact(item.amounts.currentBudgetYen)} ＝ 支出済 ${formatYenExact(item.amounts.spentYen)} ＋ 翌年度継続 ${formatYenExact(item.amounts.carryoverYen)} ＋ 年度内対応余地 ${formatYenExact(item.amounts.unusedYen)}`), visibleFlags.length === 0
        ? null
        : el("div", { class: "badge-list", "aria-label": "注目ポイント" }, ...visibleFlags.map((flag) => el("span", { class: "badge" }, attentionFlagLabel(flag)))), el("dl", { class: "candidate-grid" }, el("dt", {}, "局・分野（款）"), el("dd", {}, item.bureau), ...extraRows), el("p", { class: "source-line" }, "原本: ", source), callbacks == null ? null : detailSection(item, callbacks));
}
export function renderAttentionList(records, callbacks, heading = "行政サービス・事業の明細") {
    return el("section", { class: "attention-list", "aria-label": heading }, el("h2", {}, heading), records.length === 0
        ? el("p", { class: "empty-note" }, "条件に一致する明細はありません。")
        : null, ...records.map((record) => renderAttentionItem(record, callbacks)));
}
