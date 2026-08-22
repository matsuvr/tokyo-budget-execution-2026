import { el } from "./dom.js";
import { formatRate, formatYen, formatYenExact } from "./format.js";
import { confidenceLabel, statusLabel } from "./labels.js";
import type { AccountKeyView, ReviewCandidateView } from "./types.js";

/**
 * 要説明候補の会計内訳一覧（Issue #49）。
 * 予算現額を支出済・繰越・不用の3区分で示し、繰越と不用は常に別項目として表示する。
 */

/** 局名の代わりに使う2024年度の款名（番号接頭辞を除す） */
export function bureauOfCandidate(candidate: ReviewCandidateView): string {
  const chapter = candidate.fy2024Keys[0]?.chapter ?? "(不明)";
  return chapter.replace(/^[0-9]{1,2}:/u, "");
}

export function keyText(keys: readonly AccountKeyView[]): string {
  return keys
    .map((key) => {
      const parts = [key.account, key.chapter, key.section, key.item];
      return parts.filter((part) => part != null && part.length > 0).join(" / ");
    })
    .join(" ＋ ");
}

function breakdownBar(candidate: ReviewCandidateView): HTMLElement | null {
  const currentBudget = candidate.amounts.fy2024CurrentBudgetYen;
  if (currentBudget == null || currentBudget <= 0) return null;
  const spent = candidate.amounts.fy2024SpentYen;
  const carryover = candidate.amounts.fy2024CarryoverYen;
  const unused = candidate.amounts.fy2024UnusedYen;
  if (spent == null || carryover == null || unused == null) return null;

  const segments: { label: string; rate: number; className: string }[] = [
    { label: `支出済 ${formatRate(spent / currentBudget)}`, rate: spent / currentBudget, className: "bar-spent" },
    {
      label: `繰越 ${formatRate(carryover / currentBudget)}`,
      rate: carryover / currentBudget,
      className: "bar-carryover",
    },
    { label: `不用 ${formatRate(unused / currentBudget)}`, rate: unused / currentBudget, className: "bar-unused" },
  ];
  const bar = el(
    "div",
    { class: "breakdown-bar", role: "img", "aria-label": segments.map((s) => s.label).join(", ") },
    ...segments.map((segment) =>
      el("span", {
        class: `bar-segment ${segment.className}`,
        style: `width: ${(segment.rate * 100).toFixed(1)}%`,
      }),
    ),
  );
  return bar;
}

export function renderCandidateItem(candidate: ReviewCandidateView): HTMLElement {
  const amounts = candidate.amounts;
  const rates = candidate.rates;
  const currentBudget = amounts.fy2024CurrentBudgetYen;

  const rows: [string, string][] = [
    ["2024年度当初予算", formatYen(amounts.fy2024InitialBudgetYen)],
    ["2024年度予算現額", formatYen(currentBudget)],
    ["支出済額", `${formatYen(amounts.fy2024SpentYen)}（執行率 ${formatRate(rates.executionRate)}）`],
    ["翌年度繰越額", `${formatYen(amounts.fy2024CarryoverYen)}（繰越率 ${formatRate(rates.carryoverRate)}）`],
    ["不用額", `${formatYen(amounts.fy2024UnusedYen)}（不用率 ${formatRate(rates.unusedRate)}）`],
    ["2026年度当初予算", formatYen(amounts.fy2026InitialBudgetYen)],
    ["予算継続率", formatRate(rates.budgetContinuationRate)],
    ["対応信頼度", confidenceLabel(candidate.confidence)],
    ["判定理由", candidate.statusReasons.join("、") || "-"],
  ];

  const definitionList = el(
    "dl",
    { class: "candidate-grid" },
    ...rows.flatMap(([term, description]) => [el("dt", {}, term), el("dd", {}, description)]),
  );

  const bar = breakdownBar(candidate);
  const exactNote =
    currentBudget != null && amounts.fy2024SpentYen != null && amounts.fy2024UnusedYen != null
      ? null
      : el(
          "p",
          { class: "sub" },
          "金額の欠損があるため区分バーではなく「確認不能」と表示しています。",
        );

  return el(
    "article",
    { class: "card candidate-item" },
    el(
      "header",
      {},
      el("h3", { class: "candidate-title" }, keyText(candidate.fy2024Keys)),
      el(
        "p",
        { class: "candidate-meta" },
        el("span", { class: "badge status-badge" }, statusLabel(candidate.status)),
        ` 局（款）: ${bureauOfCandidate(candidate)}`,
        ` ・ 粒度: ${candidate.granularity}`,
      ),
    ),
    bar != null ? bar : null,
    exactNote,
    definitionList,
    el(
      "p",
      { class: "exact-amounts" },
      "予算現額 ",
      formatYenExact(currentBudget),
      " ＝ 支出済 ",
      formatYenExact(amounts.fy2024SpentYen),
      " ＋ 繰越 ",
      formatYenExact(amounts.fy2024CarryoverYen),
      " ＋ 不用 ",
      formatYenExact(amounts.fy2024UnusedYen),
    ),
  );
}

export function renderCandidateList(records: readonly ReviewCandidateView[]): HTMLElement {
  return el(
    "section",
    { class: "candidate-list", "aria-label": "要説明候補一覧" },
    el("h2", {}, "候補一覧"),
    ...(records.length === 0
      ? [el("p", { class: "empty-note" }, "条件に一致する候補はありません。")]
      : records.map((record) => renderCandidateItem(record))),
  );
}
