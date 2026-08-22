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
