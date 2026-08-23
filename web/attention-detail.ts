import { sortBreakdownComponentsByUnexecutedAmount } from "./attention-detail-sort.js";
import { el } from "./dom.js";
import { formatRate, formatYen, formatYenExact } from "./format.js";
import { reasonTagLabel } from "./labels.js";
import type {
  AttentionBreakdownComponentView,
  ExecutionAttentionDetailView,
  NameAggregateView,
} from "./types.js";

function sourceLink(title: string, url: string, page: number | null): HTMLElement {
  const suffix = page == null ? "" : `（PDF物理ページ ${page}）`;
  return el(
    "a",
    { href: url, target: "_blank", rel: "noopener noreferrer" },
    `${title}${suffix}`,
  );
}

function componentUnexecutedRate(component: AttentionBreakdownComponentView): number | null {
  const currentBudgetYen = component.amounts.currentBudgetYen;
  const yearEndUnexecutedYen = component.amounts.yearEndUnexecutedYen;
  if (!Number.isFinite(currentBudgetYen) || currentBudgetYen <= 0) return null;
  if (!Number.isFinite(yearEndUnexecutedYen)) return null;
  return yearEndUnexecutedYen / currentBudgetYen;
}

function componentBlock(component: AttentionBreakdownComponentView): HTMLElement {
  return el(
    "li",
    { class: "breakdown-component" },
    el(
      "strong",
      {},
      [
        component.accountKey.account,
        component.accountKey.chapter,
        component.accountKey.section,
        component.accountKey.item,
      ]
        .filter(Boolean)
        .join(" / "),
    ),
    el(
      "dl",
      { class: "compact-grid" },
      el("dt", {}, "予算現額"),
      el("dd", {}, formatYenExact(component.amounts.currentBudgetYen)),
      el("dt", {}, "支出済額"),
      el("dd", {}, formatYenExact(component.amounts.spentYen)),
      el("dt", {}, "翌年度繰越額"),
      el("dd", {}, formatYenExact(component.amounts.carryoverYen)),
      el("dt", {}, "不用額"),
      el("dd", {}, formatYenExact(component.amounts.unusedYen)),
      el("dt", {}, "年度内未執行額"),
      el("dd", {}, formatYenExact(component.amounts.yearEndUnexecutedYen)),
      el("dt", {}, "年度内未執行率"),
      el("dd", {}, formatRate(componentUnexecutedRate(component))),
    ),
    el(
      "p",
      { class: "source-line" },
      "原本: ",
      sourceLink(component.source.title, component.source.url, component.sourcePage),
    ),
  );
}

function aggregateList(title: string, records: readonly NameAggregateView[]): HTMLElement | null {
  if (records.length === 0) return null;
  return el(
    "section",
    { class: "evidence-list" },
    el("h5", {}, title),
    el(
      "ul",
      {},
      ...records.map((record) =>
        el(
          "li",
          {},
          `${record.name}: ${formatYen(record.amountYen)}（${record.count.toLocaleString("ja-JP")}件）`,
        ),
      ),
    ),
  );
}

function officialExplanation(detail: ExecutionAttentionDetailView): HTMLElement | null {
  if (detail.officialExplanation.status !== "confirmed") return null;
  const review = detail.officialExplanation.detail?.review ?? null;
  if (review == null) return null;
  const evidence = review.evidenceReferences ?? [];
  const content: (Node | string)[] = [];
  if (review.officialDescription.trim()) content.push(el("p", {}, review.officialDescription));
  if (review.reasonStatus === "confirmed" && review.reasonTags.length > 0) {
    content.push(el("p", {}, `理由: ${review.reasonTags.map(reasonTagLabel).join("、")}`));
  }
  if (review.improvementStatus === "confirmed" && review.improvementSummary.trim()) {
    content.push(el("p", {}, `2026年度の変更: ${review.improvementSummary}`));
  }
  if (evidence.length > 0) {
    content.push(
      el(
        "ul",
        {},
        ...evidence.map((entry) =>
          el(
            "li",
            {},
            sourceLink(entry.title, entry.url, entry.page),
            entry.summary ? ` — ${entry.summary}` : "",
          ),
        ),
      ),
    );
  }
  if (content.length === 0) return null;
  return el("section", { class: "detail-block" }, el("h4", {}, "公式資料の記載"), ...content);
}

export function renderAttentionDetail(detail: ExecutionAttentionDetailView): HTMLElement {
  const item = detail.item;
  const payment = detail.paymentEvidence;
  const componentsByUnexecutedAmount = sortBreakdownComponentsByUnexecutedAmount(
    detail.breakdown.components,
  );

  return el(
    "div",
    { class: "detail-panel card" },
    el(
      "section",
      { class: "detail-block" },
      el("h4", {}, "決算数値"),
      el(
        "dl",
        { class: "compact-grid" },
        el("dt", {}, "予算現額"),
        el("dd", {}, formatYenExact(item.amounts.currentBudgetYen)),
        el("dt", {}, "支出済額"),
        el("dd", {}, formatYenExact(item.amounts.spentYen)),
        el("dt", {}, "翌年度繰越額"),
        el("dd", {}, formatYenExact(item.amounts.carryoverYen)),
        el("dt", {}, "不用額"),
        el("dd", {}, formatYenExact(item.amounts.unusedYen)),
        el("dt", {}, "年度内未執行額"),
        el("dd", {}, formatYenExact(item.amounts.yearEndUnexecutedYen)),
      ),
    ),
    el(
      "section",
      { class: "detail-block" },
      el("h4", {}, "未執行額が大きい構成明細"),
      el(
        "ol",
        { class: "component-list" },
        ...componentsByUnexecutedAmount.map(componentBlock),
      ),
    ),
    el(
      "section",
      { class: "detail-block" },
      el("h4", {}, "実際に支出された内容（公金支出・参考）"),
      el(
        "p",
        {},
        "公金支出集計は支出済み内容の補助資料で、正式決算額や未執行額の代わりにはしません。",
      ),
      el(
        "dl",
        { class: "compact-grid" },
        el("dt", {}, "支払件数"),
        el("dd", {}, `${payment.transactionCount.toLocaleString("ja-JP")}件`),
        el("dt", {}, "公金支出集計額"),
        el("dd", {}, formatYen(payment.totalAmountYen)),
        el("dt", {}, "通常月"),
        el("dd", {}, formatYen(payment.ordinaryAmountYen)),
        el("dt", {}, "出納整理期間"),
        el("dd", {}, formatYen(payment.closingAmountYen)),
      ),
      aggregateList("節・細節の全内訳", payment.expenseBreakdown),
    ),
    officialExplanation(detail),
  );
}
