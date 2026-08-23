export const STATUS_LABELS: Record<string, string> = {
  "needs-explanation": "要説明候補",
  carryover: "遅延・繰越",
  "review-reflected": "見直し反映",
  executed: "執行済み",
  incomparable: "—",
};

export const CONFIDENCE_LABELS: Record<string, string> = {
  A: "A",
  B: "B",
  C: "C",
  unmatched: "—",
};

export const METHOD_LABELS: Record<string, string> = {
  direct: "直営・行政サービス",
  procurement: "委託・調達",
  construction: "工事・施設整備",
  subsidy: "補助・給付",
  "statutory-transfer": "法定移転・税連動",
  unknown: "—",
};

export const SCOPE_LABELS: Record<string, string> = {
  operational: "行政サービス・事業",
  "reference-only": "会計・制度上の項目",
  uncertain: "—",
};

export const GAP_COMPOSITION_LABELS: Record<string, string> = {
  "carryover-dominant": "翌年度継続分が中心",
  "unused-dominant": "年度内対応余地が中心",
  balanced: "翌年度継続分と年度内対応余地が同程度",
  unavailable: "—",
};

export const ATTENTION_FLAG_LABELS: Record<string, string> = {
  "material-unexecuted-amount": "年度内執行ギャップ額1億円以上",
  "high-unexecuted-rate": "年度内執行ギャップ率20%以上",
  "budget-continues": "2026年度予算が90%以上継続",
  "budget-expanded": "2026年度予算が増額",
  "cross-year-comparison-unavailable": "—",
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
  "malformed-account-key": "会計科目",
};

export const CONFIRMATION_LABELS: Record<string, string> = {
  confirmed: "公式資料あり",
  "not-found": "—",
  "not-reviewed": "—",
  "not-applicable": "—",
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
  "other-official-reason": "その他",
  unknown: "その他",
};

export function labelFrom(labels: Record<string, string>, value: string): string {
  return labels[value] ?? "—";
}
export function methodLabel(value: string): string { return labelFrom(METHOD_LABELS, value); }
export function scopeLabel(value: string): string { return labelFrom(SCOPE_LABELS, value); }
export function gapCompositionLabel(value: string): string { return labelFrom(GAP_COMPOSITION_LABELS, value); }
export function attentionFlagLabel(value: string): string { return labelFrom(ATTENTION_FLAG_LABELS, value); }
export function reviewScopeReasonLabel(value: string | null): string {
  return value == null ? "—" : labelFrom(REVIEW_SCOPE_REASON_LABELS, value);
}
export function confirmationLabel(value: string): string { return labelFrom(CONFIRMATION_LABELS, value); }
export function reasonTagLabel(value: string): string { return labelFrom(REASON_TAG_LABELS, value); }
export function statusLabel(value: string): string { return labelFrom(STATUS_LABELS, value); }
export function confidenceLabel(value: string): string { return CONFIDENCE_LABELS[value] ?? "—"; }
export function bureauOfChapter(chapter: string): string { return chapter.replace(/^[0-9]{1,2}:/u, ""); }
