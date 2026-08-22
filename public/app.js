import { ApiError, fetchExecutionReviewIndex, fetchReviewCandidates } from "./api.js";
import { el } from "./dom.js";
import { renderOverviewCard } from "./overview.js";
/**
 * 画面の起動と状態管理（Issue #48）。
 * 取得中・取得失敗・データなしを別表示にする。
 */
const content = document.querySelector("#content");
const errorBox = document.querySelector("#error");
const loading = document.querySelector("#loading");
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
        hideMessages();
        if (index.comparisons.comparableCount === 0 || candidates.records.length === 0) {
            showEmpty("表示できる比較データがまだありません。データ生成後に再度アクセスしてください。");
            return;
        }
        const overview = renderOverviewCard(index, candidates);
        // 後続Issue（#49以降）がこの領域に追加される
        const sections = el("div", { class: "sections" }, overview);
        content.replaceChildren(sections);
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
