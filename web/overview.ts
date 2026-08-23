import { el } from "./dom.js";
import { formatYen } from "./format.js";
import type { ExecutionReviewIndexView } from "./types.js";

export function renderOverviewCard(index: ExecutionReviewIndexView): HTMLElement | null {
  const attention = index.attentionItems;
  if (attention == null) return null;
  const operational = attention.totalsByScope.operational;
  const operationalFlags = attention.flagCountsByScope.operational;
  const continued = operationalFlags["budget-continues"] ?? 0;
  const expanded = operationalFlags["budget-expanded"] ?? 0;
  return el(
    "section",
    { class: "card overview-card", "aria-label": "年度内執行ギャップ概要" },
    el("h2", {}, "概要"),
    el("p", { class: "scope-note" }, "2024年度一般会計の決算明細を、会計・款・項・目まで集計。"),
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
      el("dt", {}, "2026年度予算が90%以上継続"),
      el("dd", {}, `${continued.toLocaleString("ja-JP")} 件`),
      el("dt", {}, "うち2026年度予算が増額"),
      el("dd", {}, `${expanded.toLocaleString("ja-JP")} 件`),
    ),
  );
}
