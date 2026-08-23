import { el } from "./dom.js";
import { reviewScopeReasonLabel } from "./labels.js";
import { renderAttentionItem, type AttentionListCallbacks } from "./attention-items.js";
import type { ExecutionAttentionItemView } from "./types.js";

function section(
  heading: string,
  description: string,
  records: readonly ExecutionAttentionItemView[],
  callbacks: AttentionListCallbacks,
): HTMLElement {
  return el(
    "section",
    { class: "reference-section" },
    el("h2", {}, heading),
    el("p", { class: "caution-note" }, description),
    records.length === 0 ? el("p", { class: "empty-note" }, "該当項目はありません。") : null,
    ...records.map((item) =>
      el(
        "div",
        { class: "reference-wrapper" },
        item.reviewScopeReasonCode == null
          ? null
          : el(
              "p",
              { class: "reference-reason" },
              `分離理由: ${reviewScopeReasonLabel(item.reviewScopeReasonCode)}${item.reviewScopeMatchedKeyword == null ? "" : `（${item.reviewScopeMatchedKeyword}）`}`,
            ),
        renderAttentionItem(item, callbacks),
      ),
    ),
  );
}

export function renderReferenceItems(
  records: readonly ExecutionAttentionItemView[],
  callbacks: AttentionListCallbacks,
): HTMLElement {
  const references = records
    .filter((item) => item.reviewScope === "reference-only")
    .sort((a, b) => b.amounts.yearEndUnexecutedYen - a.amounts.yearEndUnexecutedYen || a.itemId.localeCompare(b.itemId, "ja"));
  const uncertain = records
    .filter((item) => item.reviewScope === "uncertain")
    .sort((a, b) => b.amounts.yearEndUnexecutedYen - a.amounts.yearEndUnexecutedYen || a.itemId.localeCompare(b.itemId, "ja"));
  return el(
    "div",
    { class: "reference-view" },
    section(
      "会計・制度上の参考項目",
      "行政サービスの実施能力を直接比較する項目ではないため、主一覧と主合計から分離しています。データ自体は省略していません。",
      references,
      callbacks,
    ),
    section(
      "区分要確認",
      "対象外とは断定せず、会計科目または執行方式の追加確認が必要な項目です。",
      uncertain,
      callbacks,
    ),
  );
}
