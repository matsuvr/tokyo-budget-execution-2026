import { el } from "./dom.js";
import { formatRate, formatYen } from "./format.js";
import type { ExecutionAttentionItemView } from "./types.js";

const SUMMARY_COUNT = 6;
const HIGH_UNEXECUTED_RATE_FLAG = "high-unexecuted-rate";

const POLICY_RECOMMENDATIONS: Readonly<Record<string, string>> = {
  "一般会計:07:福祉費:04:高齢者施策推進費:03:高齢福祉費":
    "申請待ちをやめ、未申請の介護事業所へ直接働きかけて、手当を現場まで届ける。",
  "一般会計:08:保健医療費:03:医療政策費:02:医療政策費":
    "電子処方箋は補助金だけでは進まないので、医療機関と薬局の導入を地域単位でまとめて支援する。",
  "一般会計:05:都市整備費:03:市街地整備費:06:都市改造費":
    "用地取得と権利者調整の体制を厚くして、予算を実際の工事まで着実につなげる。",
  "一般会計:10:土木費:03:河川海岸費:06:中小河川整備費":
    "用地・補償と工事を一体で工程管理し、調節池や護岸の施工可能区間を切れ目なく発注する。",
  "一般会計:10:土木費:03:河川海岸費:07:高潮防御施設費":
    "設計と施工条件の調整を前倒しし、水門・防潮堤の工事を年度をまたいで止めない工程に組み直す。",
  "一般会計:07:福祉費:02:生活福祉費:06:生活支援費":
    "対象世帯を区市町村データで早期に把握し、申請待ちではなくプッシュ型案内と簡素な手続で、物価高対策や貸付支援を届ける。",
};

export interface TopUnusedSummaryEntry {
  rank: string;
  itemId: string;
  title: string;
  budget: string;
  executionRate: string;
  recommendation: string;
}

function withoutAccountCode(value: string): string {
  return value.replace(/^[0-9]{1,2}:/u, "");
}

function japanesePercent(rate: number | null): string {
  return formatRate(rate).replace("%", "％");
}

export function buildTopUnusedSummaryEntries(
  records: readonly ExecutionAttentionItemView[],
): TopUnusedSummaryEntry[] {
  return [...records]
    .filter(
      (record) =>
        record.reviewScope === "operational" &&
        record.attentionFlags.includes(HIGH_UNEXECUTED_RATE_FLAG) &&
        POLICY_RECOMMENDATIONS[record.itemId] != null,
    )
    .sort(
      (left, right) =>
        right.amounts.yearEndUnexecutedYen - left.amounts.yearEndUnexecutedYen ||
        left.itemId.localeCompare(right.itemId, "ja"),
    )
    .slice(0, SUMMARY_COUNT)
    .map((record, index) => ({
      rank: String(index + 1).padStart(2, "0"),
      itemId: record.itemId,
      title: withoutAccountCode(
        record.accountKey.item ?? record.accountKey.section ?? record.accountKey.chapter,
      ),
      budget: formatYen(record.amounts.currentBudgetYen),
      executionRate: japanesePercent(record.rates.executionRate),
      recommendation: POLICY_RECOMMENDATIONS[record.itemId],
    }));
}

export function renderTopUnusedSummary(
  records: readonly ExecutionAttentionItemView[],
): HTMLElement {
  const entries = buildTopUnusedSummaryEntries(records);
  return el(
    "section",
    { class: "top-unused-summary", "aria-labelledby": "top-unused-summary-title" },
    el(
      "div",
      { class: "top-unused-summary-header" },
      el("p", { class: "top-unused-summary-kicker" }, "未執行額 × 未執行率"),
      el("h2", { id: "top-unused-summary-title" }, "未執行額が大きい注目6項目"),
      el(
        "p",
        { class: "top-unused-summary-note" },
        "年度内執行ギャップ率20％以上の行政サービス・事業から、未執行額の大きい6件を抽出。",
      ),
    ),
    el(
      "ol",
      { class: "top-unused-summary-list" },
      ...entries.map((entry) =>
        el(
          "li",
          { class: "top-unused-summary-item" },
          el(
            "div",
            { class: "top-unused-summary-title-row" },
            el(
              "span",
              { class: "top-unused-summary-rank", "aria-hidden": "true" },
              entry.rank,
            ),
            el("h3", {}, entry.title),
          ),
          el(
            "p",
            { class: "top-unused-summary-metric" },
            "予算 ",
            el("strong", {}, entry.budget),
            "に対し、執行率は ",
            el("strong", {}, entry.executionRate),
            "。",
          ),
          el("p", { class: "top-unused-summary-recommendation" }, entry.recommendation),
        ),
      ),
    ),
  );
}
