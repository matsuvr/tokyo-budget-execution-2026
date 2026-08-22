import { el } from "./dom.js";
import { formatYen } from "./format.js";
import { sortBureausForDisplay, verifyBureauTotals } from "./bureau-sort.js";
import type { BureauSummaryView } from "./types.js";

/**
 * 局別の執行候補サマリー表示（Issue #51）。
 * 局の能力や人手不足をランキングするのではなく、件数と金額の分布を確認するための画面。
 */

export interface BureauCallbacks {
  /** 局を選択したときに候補一覧側の局フィルターへ設定する */
  onSelectBureau(bureau: string): void;
}

function bureauItem(
  bureau: BureauSummaryView["bureaus"][number],
  callbacks: BureauCallbacks,
): HTMLElement {
  const button = el(
    "button",
    { type: "button", class: "bureau-select" },
    `${bureau.chapter} の候補を一覧で見る`,
  );
  button.addEventListener("click", () => callbacks.onSelectBureau(bureau.chapter));

  return el(
    "article",
    { class: "card bureau-item" },
    el("h3", {}, bureau.chapter),
    el(
      "dl",
      { class: "candidate-grid" },
      el("dt", {}, "比較可能件数"),
      el("dd", {}, `${bureau.comparableCount.toLocaleString("ja-JP")} 件`),
      el("dt", {}, "要説明候補"),
      el("dd", {}, `${bureau.needsExplanationCount.toLocaleString("ja-JP")} 件`),
      el("dt", {}, "遅延・繰越"),
      el("dd", {}, `${bureau.carryoverCount.toLocaleString("ja-JP")} 件`),
      el("dt", {}, "見直し反映"),
      el("dd", {}, `${bureau.reviewReflectedCount.toLocaleString("ja-JP")} 件`),
      el("dt", {}, "2024年度予算現額合計"),
      el("dd", {}, formatYen(bureau.fy2024CurrentBudgetYen)),
      el("dt", {}, "支出済額合計"),
      el("dd", {}, formatYen(bureau.fy2024SpentYen)),
      el("dt", {}, "繰越額合計"),
      el("dd", {}, formatYen(bureau.fy2024CarryoverYen)),
      el("dt", {}, "不用額合計"),
      el("dd", {}, formatYen(bureau.fy2024UnusedYen)),
      el("dt", {}, "2026年度予算額合計"),
      el("dd", {}, formatYen(bureau.fy2026InitialBudgetYen)),
    ),
    button,
  );
}

export function renderBureauSection(
  summary: BureauSummaryView,
  callbacks: BureauCallbacks,
): HTMLElement {
  const sorted = sortBureausForDisplay(summary.bureaus);
  const verification = verifyBureauTotals(summary.bureaus, {
    totalComparableCount: summary.summary.totalComparableCount,
    totalFy2024CurrentBudgetYen: summary.summary.totalFy2024CurrentBudgetYen,
  });

  return el(
    "section",
    { class: "bureau-section", "aria-label": "局別サマリー" },
    el("h2", {}, "局別サマリー"),
    el(
      "p",
      { class: "caution-note" },
      "局ごとに事業の性質や予算規模が大きく異なるため、金額の大小を直接比較したり、執行率を能力の評価に使ったりしないでください。件数と金額はあくまで確認の出発点です。",
    ),
    verification.consistent
      ? null
      : el(
          "p",
          { class: "sub", role: "alert" },
          `局別行とsummaryの整合検証に失敗しました: ${verification.mismatches.join("、")}`,
        ),
    ...sorted.map((bureau) => bureauItem(bureau, callbacks)),
  );
}
