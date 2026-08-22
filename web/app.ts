import { ApiError, fetchBureauSummary, fetchExecutionReviewIndex, fetchReviewCandidates } from "./api.js";
import { renderCandidateList } from "./candidates.js";
import { el } from "./dom.js";
import { renderBureauSection } from "./bureaus.js";
import {
  applyCandidateFilters,
  defaultFilters,
} from "./filter.js";
import { renderFilterControls } from "./filters.js";
import { renderOverviewCard } from "./overview.js";
import type { CandidateFilters } from "./filter.js";
import type {
  BureauSummaryView,
  ExecutionReviewIndexView,
  ReviewCandidatesView,
} from "./types.js";

/**
 * 画面の起動と状態管理（Issue #48〜#51）。
 * 取得中・取得失敗・データなしを別表示にする。
 * フィルター状態の変更ではAPIを再取得せず、取得済みJSONへ再適用する。
 */

type ViewMode = "candidates" | "bureaus";

interface AppState {
  index: ExecutionReviewIndexView | null;
  candidates: ReviewCandidatesView | null;
  bureaus: BureauSummaryView | null;
  filters: CandidateFilters;
  view: ViewMode;
}

const content = document.querySelector<HTMLElement>("#content");
const errorBox = document.querySelector<HTMLElement>("#error");
const loading = document.querySelector<HTMLElement>("#loading");

const state: AppState = {
  index: null,
  candidates: null,
  bureaus: null,
  filters: defaultFilters(),
  view: "candidates",
};

function showError(message: string): void {
  if (errorBox == null) return;
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function hideMessages(): void {
  if (errorBox != null) {
    errorBox.textContent = "";
    errorBox.hidden = true;
  }
  if (loading != null) loading.hidden = true;
}

function showEmpty(message: string): void {
  if (content == null) return;
  content.replaceChildren(el("p", { class: "empty-note" }, message));
}

function viewToggle(): HTMLElement {
  const makeButton = (mode: ViewMode, label: string): HTMLElement => {
    const button = el("button", { type: "button", class: "view-toggle-button" }, label);
    button.setAttribute("aria-pressed", state.view === mode ? "true" : "false");
    if (state.view === mode) button.setAttribute("data-active", "");
    button.addEventListener("click", () => {
      if (state.view !== mode) {
        state.view = mode;
        renderSections();
      }
    });
    return button;
  };
  return el(
    "div",
    { class: "view-toggle", role: "group", "aria-label": "表示切り替え" },
    makeButton("candidates", "候補一覧"),
    makeButton("bureaus", "局別サマリー"),
  );
}

function renderSections(): void {
  if (content == null || state.index == null || state.candidates == null) return;
  const overview = renderOverviewCard(state.index, state.candidates);
  const records = state.candidates.records;

  const main =
    state.view === "bureaus" && state.bureaus != null
      ? renderBureauSection(state.bureaus, {
          onSelectBureau(bureau) {
            state.filters = { ...state.filters, bureau };
            state.view = "candidates";
            renderSections();
          },
        })
      : renderCandidateList(applyCandidateFilters(records, state.filters));

  // 候補一覧ビューのときだけフィルターを表示（局別ビューでは絞り込み対象が異なるため）
  const filterControls =
    state.view === "candidates"
      ? renderFilterControls(records, applyCandidateFilters(records, state.filters).length, state.filters, {
          onFiltersChange(filters) {
            state.filters = filters;
            renderSections();
          },
        })
      : null;

  const sections = el(
    "div",
    { class: "sections" },
    overview,
    viewToggle(),
    filterControls ?? "",
    main,
  );
  content.replaceChildren(sections);
}

async function main(): Promise<void> {
  if (content == null) {
    showError("画面の初期化に失敗しました");
    return;
  }
  try {
    const [index, candidates] = await Promise.all([
      fetchExecutionReviewIndex(),
      fetchReviewCandidates(),
    ]);
    let bureaus: BureauSummaryView | null = null;
    try {
      bureaus = await fetchBureauSummary();
    } catch {
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
  } catch (error) {
    hideMessages();
    if (error instanceof ApiError) {
      showError(error.message);
    } else {
      showError("予期しないエラーで画面を表示できませんでした");
    }
    console.error(error);
  }
}

void main();
