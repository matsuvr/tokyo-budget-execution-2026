export const STATUS_LABELS: Record<string, string> = {
  "needs-explanation": "要説明候補",
  carryover: "遅延・繰越",
  "review-reflected": "見直し反映",
  executed: "執行済み",
  incomparable: "比較不能",
};

export const CONFIDENCE_LABELS: Record<string, string> = {
  A: "A: 完全一致",
  B: "B: 人手確認済み対応",
  C: "C: 推定対応",
  unmatched: "対応不能",
};

export const METHOD_LABELS: Record<string, string> = {
  direct: "直営・行政サービス",
  procurement: "委託・調達",
  construction: "工事・施設整備",
  subsidy: "補助・給付",
  "statutory-transfer": "法定移転・税連動",
  unknown: "執行方式未確認",
};

export const SCOPE_LABELS: Record<string, string> = {
  operational: "行政サービス・事業",
  "reference-only": "会計・制度上の参考項目",
  uncertain: "区分要確認",
};

export const GAP_COMPOSITION_LABELS: Record<string, string> = {
  "carryover-dominant": "繰越中心",
  "unused-dominant": "不用中心",
  balanced: "繰越・不用が同程度",
  unavailable: "内訳確認不能",
};

export const ATTENTION_FLAG_LABELS: Record<string, string> = {
  "material-unexecuted-amount": "年度内未執行額1億円以上",
  "high-unexecuted-rate": "年度内未執行率20%以上",
  "budget-continues": "2026年度予算が90%以上継続",
  "budget-expanded": "2026年度予算が増額",
  "cross-year-comparison-unavailable": "2026年度との比較未確認",
};

export const REVIEW_SCOPE_REASON_LABELS: Record<string, string> = {
  "public-debt": "公債費",
  "special-ward-grant": "特別区交付金",
  "local-consumption-tax-settlement": "地方消費税清算",
  "tax-linked-cost": "税連動経費",
  "inter-account-transfer": "会計間移転",
  "reserve-fund": "予備費",
  "repayment-refund": "償還・返還・法定移転",
  "statutory-transfer": "法定移転",
  "personnel-accounting-adjustment": "人件費の会計上の調整",
  "retirement-benefit-adjustment": "退職手当・退職給付の会計上の調整",
  "malformed-account-key": "会計科目キーの確認が必要",
};

export const CONFIRMATION_LABELS: Record<string, string> = {
  confirmed: "公式資料で確認",
  "not-found": "公開資料を確認したが理由を特定できず",
  "not-reviewed": "公式資料の個別確認は未実施",
  "not-applicable": "執行体制レビューの対象外",
};

export const REASON_TAG_LABELS: Record<string, string> = {
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

export function labelFrom(labels: Record<string, string>, value: string): string {
  return labels[value] ?? `その他（${value}）`;
}
export function methodLabel(value: string): string { return labelFrom(METHOD_LABELS, value); }
export function scopeLabel(value: string): string { return labelFrom(SCOPE_LABELS, value); }
export function gapCompositionLabel(value: string): string { return labelFrom(GAP_COMPOSITION_LABELS, value); }
export function attentionFlagLabel(value: string): string { return labelFrom(ATTENTION_FLAG_LABELS, value); }
export function reviewScopeReasonLabel(value: string | null): string {
  return value == null ? "理由コードなし" : labelFrom(REVIEW_SCOPE_REASON_LABELS, value);
}
export function confirmationLabel(value: string): string { return labelFrom(CONFIRMATION_LABELS, value); }
export function reasonTagLabel(value: string): string { return labelFrom(REASON_TAG_LABELS, value); }
export function statusLabel(value: string): string { return labelFrom(STATUS_LABELS, value); }
export function confidenceLabel(value: string): string { return CONFIDENCE_LABELS[value] ?? value; }
export function bureauOfChapter(chapter: string): string { return chapter.replace(/^[0-9]{1,2}:/u, ""); }
