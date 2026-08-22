import { ApiError, fetchBureauSummary, fetchExecutionReviewIndex, fetchReviewCandidates } from "./api.js";
import { el } from "./dom.js";
import { renderCandidateList } from "./candidates.js";
import { applyCandidateFilters, defaultFilters, } from "./filter.js";
import { renderFilterControls } from "./filters.js";
import { renderOverviewCard } from "./overview.js";
const content = document.querySelector("#content");
const errorBox = document.querySelector("#error");
const loading = document.querySelector("#loading");
const state = {
    index: null,
    candidates: null,
    bureaus: null,
    filters: defaultFilters(),
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
    if (content == null)
        return;
    content.replaceChildren(el("p", { class: "empty-note" }, message));
}
function renderSections() {
    if (content == null || state.index == null || state.candidates == null)
        return;
    const overview = renderOverviewCard(state.index, state.candidates);
    const records = state.candidates.records;
    const filtered = applyCandidateFilters(records, state.filters);
    const filterControls = renderFilterControls(records, filtered.length, state.filters, {
        onFiltersChange(filters) {
            state.filters = filters;
            renderSections();
        },
    });
    const candidateList = renderCandidateList(filtered);
    const sections = el("div", { class: "sections" }, overview, filterControls, candidateList);
    content.replaceChildren(sections);
}
async function main() {
    if (content == null) {
        showError("画面の初期化に失敗しました");
        return;
    }
    try {
        const [index, candidates] = await Promise.all([
            fetchExecutionReviewIndex(),
            fetchReviewCandidates(),
        ]);
        let bureaus = null;
        try {
            bureaus = await fetchBureauSummary();
        }
        catch {
            // 局別サマリーが取得できなくても候補一覧は表示する
            bureaus = null;
        }
        state.index = index;
        state.candidates = candidates;
        state.bureaus = bureaus;
        hideMessages();
        if (index.comparisons.comparableCount === 0 || candidates.records.length === 0) {
            showEmpty("表示できる比較データがまだありません。データ生成後に再度アクセスしてください。");
            return;
        }
        renderSections();
    }
    catch (error) {
        hideMessages();
        if (error instanceof ApiError) {
            showError(error.message);
        }
        else {
            showError("予期しないエラーで画面を表示できませんでした");
        }
        console.error(error);
    }
}
void main();
