import { el } from "./dom.js";
import { formatYen } from "./format.js";
import type { ExecutionReviewIndexView } from "./types.js";

export function renderOverviewCard(index: ExecutionReviewIndexView): HTMLElement {
  const attention = index.attentionItems;
  if (attention == null) {
    return el(
      "section",
      { class: "card overview-card", "aria-label": "年度内執行ギャップ概要" },
      el("h2", {}, "概要"),
      el("p", { class: "empty-note" }, "全明細データは生成中です。旧比較データのみ利用できます。"),
    );
  }
  const operational = attention.totalsByScope.operational;
  const operationalFlags = attention.flagCountsByScope.operational;
  const continued = operationalFlags["budget-continues"] ?? 0;
  const expanded = operationalFlags["budget-expanded"] ?? 0;
  return el(
    "section",
    { class: "card overview-card", "aria-label": "年度内執行ギャップ概要" },
    el("h2", {}, "概要"),
    el(
      "p",
      { class: "scope-note" },
      "2024年度一般会計の正式決算について、行政サービス・事業の最下位明細（目）を集計しています。",
    ),
    el(
      "dl",
      { class: "overview-grid" },
      el("dt", {}, "行政サービス・事業の明細数"),
      el("dd", {}, `${attention.scopeCounts.operational.toLocaleString("ja-JP")} 件`),
      el("dt", {}, "年度内執行ギャップ額"),
      el("dd", {}, formatYen(operational.yearEndUnexecutedYen)),
      el("dt", {}, "内訳: 翌年度継続分"),
      el("dd", {}, formatYen(operational.carryoverYen)),
      el("dt", {}, "内訳: 年度内対応余地"),
      el("dd", {}, formatYen(operational.unusedYen)),
      el("dt", {}, "2026年度比較あり"),
      el("dd", {}, `${attention.comparisonCounts.attached.toLocaleString("ja-JP")} 件`),
      el("dt", {}, "2026年度比較未確認"),
      el("dd", {}, `${attention.comparisonCounts.unavailable.toLocaleString("ja-JP")} 件`),
      el("dt", {}, "2026年度予算が90%以上継続"),
      el("dd", {}, `${continued.toLocaleString("ja-JP")} 件（うち増額 ${expanded.toLocaleString("ja-JP")} 件）`),
    ),
    el(
      "p",
      { class: "reference-counts" },
      `会計・制度上の参考項目 ${attention.scopeCounts["reference-only"].toLocaleString("ja-JP")} 件 ／ 区分要確認 ${attention.scopeCounts.uncertain.toLocaleString("ja-JP")} 件`,
    ),
    el(
      "p",
      { class: "caution-note" },
      "年度内執行ギャップ額は、翌年度継続分と年度内対応余地の合計です。年度内対応余地は、予算現額のうち支出済みでも翌年度継続でもない部分を追加検証の入口として表した名称で、需要変動や経費節減等も含み得ます。",
    ),
  );
}
