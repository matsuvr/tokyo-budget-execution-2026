/**
 * 内部状態値の表示ラベル。UIラベルに内部enum名（英語ID）を露出しない。
 */
export const STATUS_LABELS = {
    "needs-explanation": "要説明候補",
    carryover: "遅延・繰越",
    "review-reflected": "見直し反映",
    executed: "執行済み",
    incomparable: "比較不能",
};
export const CONFIDENCE_LABELS = {
    A: "A: 完全一致",
    B: "B: 人手確認済み対応",
    C: "C: 推定対応",
    unmatched: "対応不能",
};
export const METHOD_LABELS = {
    direct: "直営・行政サービス",
    procurement: "委託・調達",
    construction: "工事・施設整備",
    subsidy: "補助・給付",
    "statutory-transfer": "法定移転・税連動",
    unknown: "未分類",
};
export function methodLabel(method) {
    return METHOD_LABELS[method] ?? method;
}
/** 確認状態の表示。not-foundを「理由なし」とは断定しない */
export const CONFIRMATION_LABELS = {
    confirmed: "公式資料で確認",
    "not-found": "公開資料から確認できず",
    "not-applicable": "対象外",
};
export const REASON_TAG_LABELS = {
    "low-demand": "需要の低さ",
    "strict-eligibility-or-application": "条件・申請の厳しさ",
    "insufficient-awareness": "周知不足",
    "procurement-failure": "入札不調",
    "contract-or-specification-delay": "契約・仕様策定の遅れ",
    "construction-or-land-delay": "工事・用地取得の遅れ",
    "cost-saving": "経費節約",
    "external-condition-change": "外部環境の変化",
    "staffing-or-delivery-capacity": "人員・対応能力",
    "other-official-reason": "その他（公式資料の記載）",
    unknown: "内容特定不能",
};
export function reasonTagLabel(tag) {
    return REASON_TAG_LABELS[tag] ?? tag;
}
export function statusLabel(status) {
    return STATUS_LABELS[status] ?? `その他（${status}）`;
}
export function confidenceLabel(confidence) {
    return CONFIDENCE_LABELS[confidence] ?? confidence;
}
/** 局名の代わりに使う2024年度の款名（番号接頭辞を除す）。純粋関数 */
export function bureauOfChapter(chapter) {
    return chapter.replace(/^[0-9]{1,2}:/u, "");
}
