import { el } from "./dom.js";
import { formatYen, formatYenExact } from "./format.js";
import { confirmationLabel, methodLabel, reasonTagLabel, } from "./labels.js";
function sourceLink(title, url, page) {
    const suffix = page == null ? "" : `（PDF物理ページ ${page}）`;
    return el("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, `${title}${suffix}`);
}
function componentBlock(component) {
    return el("li", { class: "breakdown-component" }, el("strong", {}, [component.accountKey.account, component.accountKey.chapter, component.accountKey.section, component.accountKey.item].filter(Boolean).join(" / ")), el("dl", { class: "compact-grid" }, el("dt", {}, "予算現額"), el("dd", {}, formatYenExact(component.amounts.currentBudgetYen)), el("dt", {}, "支出済額"), el("dd", {}, formatYenExact(component.amounts.spentYen)), el("dt", {}, "翌年度継続分"), el("dd", {}, formatYenExact(component.amounts.carryoverYen)), el("dt", {}, "年度内対応余地"), el("dd", {}, formatYenExact(component.amounts.unusedYen)), el("dt", {}, "執行方式"), el("dd", {}, methodLabel(component.executionMethod))), el("p", { class: "source-line" }, "原本: ", sourceLink(component.source.title, component.source.url, component.sourcePage)));
}
function aggregateList(title, records) {
    return el("section", { class: "evidence-list" }, el("h5", {}, title), records.length === 0
        ? el("p", { class: "empty-note" }, "確認できる明細はありません。")
        : el("ul", {}, ...records.map((record) => el("li", {}, `${record.name}: ${formatYen(record.amountYen)}（${record.count.toLocaleString("ja-JP")}件）`))));
}
function officialExplanation(detail) {
    const official = detail.officialExplanation;
    const review = official.detail?.review ?? null;
    const evidence = review?.evidenceReferences ?? [];
    const content = [
        el("p", { class: "status-line" }, confirmationLabel(official.status)),
    ];
    if (review != null) {
        if (review.officialDescription.trim())
            content.push(el("p", {}, review.officialDescription));
        if (review.reasonTags.length > 0) {
            content.push(el("p", {}, `確認済み理由タグ: ${review.reasonTags.map(reasonTagLabel).join("、")}`));
        }
        if (review.improvementSummary.trim()) {
            content.push(el("p", {}, `2026年度の変更: ${review.improvementSummary}`));
        }
        if (evidence.length > 0) {
            content.push(el("ul", {}, ...evidence.map((entry) => el("li", {}, sourceLink(entry.title, entry.url, entry.page), entry.summary ? ` — ${entry.summary}` : ""))));
        }
    }
    else if (official.status === "not-reviewed") {
        content.push(el("p", {}, "この項目について、公開資料を使った個別理由調査はまだ行っていません。"));
    }
    return el("section", { class: "detail-block" }, el("h4", {}, "公式資料で確認できた説明"), ...content);
}
export function renderAttentionDetail(detail) {
    const item = detail.item;
    const payment = detail.paymentEvidence;
    return el("div", { class: "detail-panel card" }, el("section", { class: "detail-block" }, el("h4", {}, "決算数値"), el("p", { class: "caution-note" }, "「年度内対応余地」は、予算現額のうち支出済みでも翌年度継続でもない部分を、追加の政策・執行検証につなげるために表した表示名です。"), el("dl", { class: "compact-grid" }, el("dt", {}, "予算現額"), el("dd", {}, formatYenExact(item.amounts.currentBudgetYen)), el("dt", {}, "支出済額"), el("dd", {}, formatYenExact(item.amounts.spentYen)), el("dt", {}, "翌年度継続分"), el("dd", {}, formatYenExact(item.amounts.carryoverYen)), el("dt", {}, "年度内対応余地"), el("dd", {}, formatYenExact(item.amounts.unusedYen)), el("dt", {}, "年度内執行ギャップ額"), el("dd", {}, formatYenExact(item.amounts.yearEndUnexecutedYen)))), el("section", { class: "detail-block" }, el("h4", {}, "構成明細"), detail.breakdown.reconciliation === "mismatch"
        ? el("p", { class: "warning-note", role: "alert" }, "比較側の集計額と構成明細の合計が一致しません。明細は省略せず表示します。")
        : null, el("ol", { class: "component-list" }, ...detail.breakdown.components.map(componentBlock))), el("section", { class: "detail-block" }, el("h4", {}, "公金支出で確認できる支払内容"), el("p", { class: "caution-note" }, "公金支出の集計は正式決算の支出済額を置き換えるものではありません。"), el("dl", { class: "compact-grid" }, el("dt", {}, "照合粒度"), el("dd", {}, payment.matchGranularity), el("dt", {}, "支払件数"), el("dd", {}, `${payment.transactionCount.toLocaleString("ja-JP")}件`), el("dt", {}, "公金支出集計額"), el("dd", {}, formatYen(payment.totalAmountYen)), el("dt", {}, "通常月"), el("dd", {}, formatYen(payment.ordinaryAmountYen)), el("dt", {}, "出納整理期間"), el("dd", {}, formatYen(payment.closingAmountYen))), aggregateList("支払件名上位", payment.topPaymentNames), aggregateList("節・細節の全内訳", payment.expenseBreakdown)), officialExplanation(detail), el("section", { class: "detail-block" }, el("h4", {}, "追加で確認したい問い"), detail.investigationQuestions.length === 0
        ? el("p", { class: "empty-note" }, "この区分では執行体制に関する確認質問を設定していません。")
        : el("ul", {}, ...detail.investigationQuestions.map((question) => el("li", {}, question.text)))));
}
