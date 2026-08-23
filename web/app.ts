import {
  ApiError,
  fetchAttentionBureauSummary,
  fetchExecutionAttentionDetail,
  fetchExecutionAttentionItems,
  fetchExecutionReviewIndex,
} from "./api.js";
import {
  applyAttentionFilters,
  defaultAttentionFilters,
  sortAttentionItems,
  type AttentionFilters,
  type AttentionSort,
} from "./attention-filter.js";
import { renderAttentionFilters } from "./attention-filters.js";
import { renderAttentionList, type AttentionDetailSlot } from "./attention-items.js";
import { renderAttentionBureaus } from "./attention-bureaus.js";
import { renderReferenceItems } from "./reference-items.js";
import { el } from "./dom.js";
import { renderOverviewCard } from "./overview.js";
import type {
  AttentionBureauSummaryView,
  ExecutionAttentionDetailView,
  ExecutionAttentionItemsView,
  ExecutionReviewIndexView,
} from "./types.js";

type ViewMode = "items" | "bureaus" | "reference";
interface DetailCacheEntry {
  loading: boolean;
  error: string | null;
  data: ExecutionAttentionDetailView | null;
}
interface AppState {
  index: ExecutionReviewIndexView | null;
  items: ExecutionAttentionItemsView | null;
  bureaus: AttentionBureauSummaryView | null;
  filters: AttentionFilters;
  sort: AttentionSort;
  view: ViewMode;
  expandedItemIds: Set<string>;
  detailCache: Map<string, DetailCacheEntry>;
}

const content = document.querySelector<HTMLElement>("#content");
const errorBox = document.querySelector<HTMLElement>("#error");
const loading = document.querySelector<HTMLElement>("#loading");
const state: AppState = {
  index: null,
  items: null,
  bureaus: null,
  filters: defaultAttentionFilters(),
  sort: "unexecuted-amount-desc",
  view: "items",
  expandedItemIds: new Set(),
  detailCache: new Map(),
};

function showError(message: string): void {
  if (errorBox == null) return;
  errorBox.textContent = message;
  errorBox.hidden = false;
}
function hideMessages(): void {
  if (errorBox != null) { errorBox.textContent = ""; errorBox.hidden = true; }
  if (loading != null) loading.hidden = true;
}
function showEmpty(message: string): void {
  content?.replaceChildren(el("p", { class: "empty-note" }, message));
}

function detailSlot(itemId: string): AttentionDetailSlot {
  const cached = state.detailCache.get(itemId);
  return {
    expanded: state.expandedItemIds.has(itemId),
    loading: cached?.loading ?? false,
    error: cached?.error ?? null,
    data: cached?.data ?? null,
  };
}

async function toggleDetail(itemId: string): Promise<void> {
  if (state.expandedItemIds.has(itemId)) {
    state.expandedItemIds.delete(itemId);
    renderSections();
    return;
  }
  state.expandedItemIds.add(itemId);
  if (!state.detailCache.has(itemId)) {
    state.detailCache.set(itemId, { loading: true, error: null, data: null });
    renderSections();
    try {
      const data = await fetchExecutionAttentionDetail(itemId);
      state.detailCache.set(itemId, { loading: false, error: null, data });
    } catch (error) {
      state.detailCache.set(itemId, {
        loading: false,
        error: error instanceof ApiError ? error.message : "詳細の取得に失敗しました",
        data: null,
      });
    }
  }
  renderSections();
}

const detailCallbacks = {
  getDetailSlot(item: { itemId: string }): AttentionDetailSlot { return detailSlot(item.itemId); },
  onToggleDetail(item: { itemId: string }): void { void toggleDetail(item.itemId); },
};

function viewToggle(): HTMLElement {
  const labels: Record<ViewMode, string> = {
    items: "行政サービス・事業",
    bureaus: "局・分野別",
    reference: "参考項目・区分要確認",
  };
  return el(
    "nav",
    { class: "view-toggle", "aria-label": "表示切り替え" },
    ...Object.entries(labels).map(([mode, label]) => {
      const button = el("button", { type: "button", class: "view-toggle-button" }, label);
      button.setAttribute("aria-pressed", state.view === mode ? "true" : "false");
      if (state.view === mode) button.setAttribute("data-active", "");
      button.addEventListener("click", () => {
        state.view = mode as ViewMode;
        renderSections();
      });
      return button;
    }),
  );
}

function renderSections(): void {
  if (content == null || state.index == null || state.items == null) return;
  const all = state.items.records;
  let main: HTMLElement;
  let filters: HTMLElement | null = null;
  if (state.view === "bureaus") {
    main = state.bureaus == null
      ? el("p", { class: "empty-note" }, "局・分野別サマリーを取得できませんでした。主一覧は利用できます。")
      : renderAttentionBureaus(state.bureaus, {
          onSelectBureau(bureau) {
            state.filters = { ...state.filters, scope: "operational", bureau };
            state.view = "items";
            renderSections();
          },
        });
  } else if (state.view === "reference") {
    main = renderReferenceItems(all, detailCallbacks);
  } else {
    const filtered = sortAttentionItems(applyAttentionFilters(all, state.filters), state.sort);
    filters = renderAttentionFilters(all, filtered.length, state.filters, state.sort, {
      onChange(nextFilters, nextSort) {
        state.filters = nextFilters;
        state.sort = nextSort;
        renderSections();
      },
    });
    main = renderAttentionList(filtered, detailCallbacks);
  }
  content.replaceChildren(
    el(
      "div",
      { class: "sections" },
      renderOverviewCard(state.index),
      viewToggle(),
      filters,
      main,
    ),
  );
}

async function main(): Promise<void> {
  if (content == null) { showError("画面の初期化に失敗しました"); return; }
  try {
    const [index, items] = await Promise.all([
      fetchExecutionReviewIndex(),
      fetchExecutionAttentionItems(),
    ]);
    let bureaus: AttentionBureauSummaryView | null = null;
    try { bureaus = await fetchAttentionBureauSummary(); } catch { bureaus = null; }
    state.index = index;
    state.items = items;
    state.bureaus = bureaus;
    hideMessages();
    if (items.records.length === 0) {
      showEmpty("表示できる2024年度執行明細がありません。データ生成後に再度アクセスしてください。");
      return;
    }
    renderSections();
  } catch (error) {
    hideMessages();
    showError(error instanceof ApiError ? error.message : "予期しないエラーで画面を表示できませんでした");
    console.error(error);
  }
}

void main();
