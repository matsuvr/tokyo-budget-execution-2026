import { ApiError, fetchAttentionBureauSummary, fetchExecutionAttentionDetail, fetchExecutionAttentionItems, fetchExecutionReviewIndex, } from "./api.js";
import { applyAttentionFilters, defaultAttentionFilters, sortAttentionItems, } from "./attention-filter.js";
import { renderAttentionFilters } from "./attention-filters.js";
import { renderAttentionList } from "./attention-items.js";
import { renderAttentionBureaus } from "./attention-bureaus.js";
import { el } from "./dom.js";
import { renderOverviewCard } from "./overview.js";
import { renderTopUnusedSummary } from "./top-unused-summary.js";
const content = document.querySelector("#content");
const errorBox = document.querySelector("#error");
const loading = document.querySelector("#loading");
const state = {
    index: null,
    items: null,
    bureaus: null,
    filters: defaultAttentionFilters(),
    sort: "unexecuted-amount-desc",
    view: "items",
    expandedItemIds: new Set(),
    detailCache: new Map(),
};
function showError(message) {
    if (errorBox == null)
        return;
    errorBox.textContent = message;
    errorBox.hidden = false;
}
function hideMessages() {
    if (errorBox != null) {
        errorBox.textContent = "";
        errorBox.hidden = true;
    }
    if (loading != null)
        loading.hidden = true;
}
function showEmpty(message) {
    content?.replaceChildren(el("p", { class: "empty-note" }, message));
}
function detailSlot(itemId) {
    const cached = state.detailCache.get(itemId);
    return {
        expanded: state.expandedItemIds.has(itemId),
        loading: cached?.loading ?? false,
        error: cached?.error ?? null,
        data: cached?.data ?? null,
    };
}
async function toggleDetail(itemId) {
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
        }
        catch (error) {
            state.detailCache.set(itemId, {
                loading: false,
                error: error instanceof ApiError ? error.message : "詳細を表示できませんでした",
                data: null,
            });
        }
    }
    renderSections();
}
const detailCallbacks = {
    getDetailSlot(item) { return detailSlot(item.itemId); },
    onToggleDetail(item) { void toggleDetail(item.itemId); },
};
function viewToggle() {
    const labels = {
        items: "行政サービス・事業",
        bureaus: "局・分野別",
    };
    return el("nav", { class: "view-toggle", "aria-label": "表示切り替え" }, ...Object.entries(labels).map(([mode, label]) => {
        const button = el("button", { type: "button", class: "view-toggle-button" }, label);
        button.setAttribute("aria-pressed", state.view === mode ? "true" : "false");
        if (state.view === mode)
            button.setAttribute("data-active", "");
        button.addEventListener("click", () => {
            state.view = mode;
            renderSections();
        });
        return button;
    }));
}
function renderSections() {
    if (content == null || state.index == null || state.items == null)
        return;
    const all = state.items.records;
    let main;
    let filters = null;
    if (state.view === "bureaus" && state.bureaus != null) {
        main = renderAttentionBureaus(state.bureaus, {
            onSelectBureau(bureau) {
                state.filters = { ...state.filters, scope: "operational", bureau };
                state.view = "items";
                renderSections();
            },
        });
    }
    else {
        if (state.view === "bureaus")
            state.view = "items";
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
    content.replaceChildren(el("div", { class: "sections" }, renderTopUnusedSummary(all), renderOverviewCard(state.index), viewToggle(), filters, main));
}
async function main() {
    if (content == null) {
        showError("画面を表示できませんでした");
        return;
    }
    try {
        const [index, items] = await Promise.all([
            fetchExecutionReviewIndex(),
            fetchExecutionAttentionItems(),
        ]);
        let bureaus = null;
        try {
            bureaus = await fetchAttentionBureauSummary();
        }
        catch {
            bureaus = null;
        }
        state.index = index;
        state.items = items;
        state.bureaus = bureaus;
        hideMessages();
        if (items.records.length === 0) {
            showEmpty("表示する明細がありません。");
            return;
        }
        renderSections();
    }
    catch (error) {
        hideMessages();
        showError(error instanceof ApiError ? error.message : "画面を表示できませんでした");
        console.error(error);
    }
}
void main();