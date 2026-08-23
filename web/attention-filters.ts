import { el } from "./dom.js";
import { ALL, availableValues, clearAttentionFilters, type AttentionFilters, type AttentionSort } from "./attention-filter.js";
import {
  ATTENTION_FLAG_LABELS,
  GAP_COMPOSITION_LABELS,
} from "./labels.js";
import type { ExecutionAttentionItemView } from "./types.js";

export interface AttentionFilterCallbacks {
  onChange(filters: AttentionFilters, sort: AttentionSort): void;
}

function selectControl(
  label: string,
  id: string,
  value: string,
  options: readonly { value: string; label: string }[],
  onChange: (value: string) => void,
): HTMLElement {
  const select = el("select", { id, name: id }) as HTMLSelectElement;
  for (const option of options) {
    const node = el("option", { value: option.value }, option.label);
    if (option.value === value) node.setAttribute("selected", "");
    select.append(node);
  }
  select.addEventListener("change", () => onChange(select.value));
  return el("div", { class: "filter-field" }, el("label", { for: id }, label), select);
}

export function renderAttentionFilters(
  allRecords: readonly ExecutionAttentionItemView[],
  filteredCount: number,
  filters: AttentionFilters,
  sort: AttentionSort,
  callbacks: AttentionFilterCallbacks,
): HTMLElement {
  const update = (patch: Partial<AttentionFilters>, nextSort = sort) =>
    callbacks.onChange({ ...filters, ...patch }, nextSort);
  const bureauOptions = [{ value: ALL, label: "すべての局・分野" }, ...availableValues(allRecords, "bureau").map((value) => ({ value, label: value }))];
  const compositionOptions = [
    { value: ALL, label: "すべての内訳" },
    ...Object.entries(GAP_COMPOSITION_LABELS)
      .filter(([value]) => value !== "unavailable")
      .map(([value, label]) => ({ value, label })),
  ];
  const signalOptions = [
    { value: ALL, label: "すべての注目ポイント" },
    ...Object.entries(ATTENTION_FLAG_LABELS)
      .filter(([value]) => value !== "cross-year-comparison-unavailable")
      .map(([value, label]) => ({ value, label })),
  ];
  const comparisonOptions = [
    { value: "all", label: "2026年度予算: すべて" },
    { value: "attached", label: "2026年度予算あり" },
  ];
  const sortOptions = [
    { value: "unexecuted-amount-desc", label: "年度内執行ギャップ額が大きい順" },
    { value: "unexecuted-rate-desc", label: "年度内執行ギャップ率が高い順" },
    { value: "current-budget-desc", label: "予算現額が大きい順" },
    { value: "account-key-asc", label: "会計科目順" },
  ];
  const reset = el("button", { type: "button", class: "reset-button" }, "条件をリセット");
  reset.addEventListener("click", () => callbacks.onChange(clearAttentionFilters(), "unexecuted-amount-desc"));
  return el(
    "section",
    { class: "card filter-card", "aria-label": "明細の絞り込みと並べ替え" },
    el("h2", {}, "絞り込み・並べ替え"),
    el(
      "div",
      { class: "filter-controls" },
      selectControl("局・分野（款）", "attention-bureau", filters.bureau, bureauOptions, (value) => update({ bureau: value })),
      selectControl("執行ギャップの内訳", "attention-composition", filters.gapComposition, compositionOptions, (value) => update({ gapComposition: value })),
      selectControl("2026年度予算", "attention-comparison", filters.comparison, comparisonOptions, (value) => update({ comparison: value as AttentionFilters["comparison"] })),
      selectControl("注目ポイント", "attention-signal", filters.signal, signalOptions, (value) => update({ signal: value as AttentionFilters["signal"] })),
      selectControl("並べ替え", "attention-sort", sort, sortOptions, (value) => update({}, value as AttentionSort)),
    ),
    el("p", { class: "filter-count", "aria-live": "polite" }, `${filteredCount.toLocaleString("ja-JP")} 件 / 全 ${allRecords.length.toLocaleString("ja-JP")} 件`),
    reset,
  );
}
