import { el } from "./dom.js";
import { formatYen, formatYenExact } from "./format.js";
import { confidenceLabel, methodLabel, reasonTagLabel } from "./labels.js";
import type { PolicyReviewDetailView } from "./types.js";

/**
 * 重点レビュー詳細パネル（Issue #52）。
 * 公式事実と公金支出の補助証拠を別区画に表示する。
 */

function evidenceList(detail: PolicyReviewDetailView): HTMLElement | null {
  const review = detail.review;
  if (review == null || review.evidenceReferences.length === 0) return null;
  return el(
    "div",
    { class: "evidence-block" },
    el("h4", {}, "根拠資料（東京都公式・新しいタブで開きます）"),
    el(
      "ul",
      {},
      ...review.evidenceReferences.map((reference) =>
        el(
          "li",
          {},
          el(
            "a",
            {
              href: reference.url,
              target: "_blank",
              rel: "noopener noreferrer",
            },
            reference.title,
          ),
          reference.page != null ? `（${reference.page}ページ）` : "",
          el("span", { class: "sub", style: "display:block" }, reference.summary),
        ),
      ),
    ),
  );
}

function paymentEvidenceBlock(detail: PolicyReviewDetailView): HTMLElement {
  const evidence = detail.paymentEvidence;
  if (evidence == null) {
    return el(
      "div",
      { class: "payment-block" },
      el("h4", {}, "公金支出の補助証拠"),
      el("p", { class: "sub" }, "対象期間の支払実績はありません。"),
    );
  }
  return el(
    "div",
    { class: "payment-block" },
    el("h4", {}, "公金支出の補助証拠"),
    el(
      "p",
      { class: "sub" },
      "支払件名・金額は支出内容を示す補助的な情報であり、正式決算の支出済額とは一致しません。執行率の計算には使っていません。",
    ),
    el(
      "ul",
      {},
      el("li", {}, `支払件数: ${evidence.transactionCount.toLocaleString("ja-JP")} 件`),
      el("li", {}, `支払合計額: ${formatYen(evidence.totalAmountYen)}`),
      ...evidence.topPaymentNames.slice(0, 5).map((payment) =>
        el("li", {}, `${payment.name}: ${formatYenExact(payment.amountYen)}（${payment.count}件）`),
      ),
    ),
  );
}

export function renderDetailPanel(detail: PolicyReviewDetailView): HTMLElement {
  const review = detail.review;
  const amounts = detail.analysis.amounts;

  const reasonText =
    review == null
      ? "この候補は重点レビューの公式確認がまだ行われていません。"
      : review.reasonStatus === "confirmed"
        ? `公式資料に理由の記載があります${
            review.reasonTags.length > 0
              ? `（${review.reasonTags.map(reasonTagLabel).join("、")}）`
              : ""
          }`
        : review.reasonStatus === "not-found"
          ? "低執行の原因は公開資料から確認できませんでした（理由がないと断定するものではありません）"
          : "本候補の性質上、理由の記載は対象です";

  const improvementText =
    review == null
      ? ""
      : review.improvementStatus === "confirmed"
        ? review.improvementSummary
        : review.improvementStatus === "not-found"
          ? "制度・体制・予算の変更は公開資料から確認できませんでした（変更がないと断定するものではありません）"
          : "本候補の性質上、改善策の記載は対象外です";

  return el(
    "article",
    { class: "card detail-panel", "aria-label": "重点レビュー詳細" },
    el("h3", {}, `重点レビュー: ${detail.policyTitle}`),
    el(
      "p",
      { class: "candidate-meta" },
      `局（款）: ${detail.bureau ?? "-"} ・ 執行方式: ${methodLabel(detail.executionMethod)} ・ 対応信頼度: ${confidenceLabel(detail.confidence)}`,
    ),
    el(
      "dl",
      { class: "candidate-grid" },
      el("dt", {}, "2024年度当初予算"),
      el("dd", {}, formatYen(amounts.fy2024InitialBudgetYen)),
      el("dt", {}, "2024年度予算現額"),
      el("dd", {}, formatYen(amounts.fy2024CurrentBudgetYen)),
      el("dt", {}, "支出済額"),
      el("dd", {}, formatYen(amounts.fy2024SpentYen)),
      el("dt", {}, "翌年度繰越額"),
      el("dd", {}, formatYen(amounts.fy2024CarryoverYen)),
      el("dt", {}, "不用額"),
      el("dd", {}, formatYen(amounts.fy2024UnusedYen)),
      el("dt", {}, "2026年度当初予算"),
      el("dd", {}, formatYen(amounts.fy2026InitialBudgetYen)),
    ),
    el(
      "div",
      { class: "finding-block" },
      el("h4", {}, "公式に確認できた低執行の理由・2026年度の変更"),
      el("p", {}, reasonText),
      improvementText.length > 0 ? el("p", {}, improvementText) : null,
      review != null && review.reviewerNotes.length > 0
        ? el("p", { class: "sub" }, `確認メモ: ${review.reviewerNotes}`)
        : null,
    ),
    evidenceList(detail),
    paymentEvidenceBlock(detail),
  );
}
