import type { ExecutionMethod } from "./types.ts";
import type { MappingConfidence } from "./types.ts";

/**
 * 重点レビュー（政策レビュー）記録のデータ契約（Issue #34）。
 *
 * - 政策名・執行方式・低執行理由・改善策を、推測と公式確認済み情報に分けて保存する。
 * - 低執行理由タグは公式資料に根拠がある場合だけ付ける。推測で補完しない。
 * - 長い原文引用は保存せず、要旨とページ参照を保存する。
 */

/**
 * 低執行理由タグ。公式資料の記載を根拠に付けられるタグのみを表現する。
 * - staffing-or-delivery-capacity は、公式資料に人員不足・対応能力などの文言が
 *   明記された場合だけ使用すること（金額や実績値からの推測を禁止する）。
 * - unknown: 何らかの理由言及があるが内容が特定できない場合。
 *   理由自体が見つからない場合は reasonStatus="not-found" を使う（unknownと区別する）。
 */
export type LowExecutionReasonTag =
  | "low-demand"
  | "strict-eligibility-or-application"
  | "insufficient-awareness"
  | "procurement-failure"
  | "contract-or-specification-delay"
  | "construction-or-land-delay"
  | "cost-saving"
  | "external-condition-change"
  | "staffing-or-delivery-capacity"
  | "other-official-reason"
  | "unknown";

/** 理由・改善策の確認状態 */
export type ConfirmationStatus =
  /** 公式資料で確認できた */
  | "confirmed"
  /** 探したが公式資料に記載がなかった */
  | "not-found"
  /** 性質上そもそも理由・改善策が適用されない（例: 予備費） */
  | "not-applicable";

/** 公式根拠1件。原文の長文引用は保存せず要旨とページ参照を保持する。 */
export interface PolicyEvidenceReference {
  /** 資料名 */
  title: string;
  /** 東京都公式配下のURL */
  url: string;
  /** ページ番号（PDFの場合）。不明ならnull */
  page: number | null;
  /** 要旨（引用ではなく要約） */
  summary: string;
}

/** 対応信頼度（比較側の確度を併記するため） */
export type PolicyReviewMappingConfidence = MappingConfidence;

const REASON_TAGS: readonly string[] = [
  "low-demand",
  "strict-eligibility-or-application",
  "insufficient-awareness",
  "procurement-failure",
  "contract-or-specification-delay",
  "construction-or-land-delay",
  "cost-saving",
  "external-condition-change",
  "staffing-or-delivery-capacity",
  "other-official-reason",
  "unknown",
];
const CONFIRMATION_STATUSES: readonly string[] = ["confirmed", "not-found", "not-applicable"];
const EXECUTION_METHODS: readonly string[] = [
  "direct",
  "procurement",
  "construction",
  "subsidy",
  "statutory-transfer",
  "unknown",
];

export interface PolicyReviewValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 重点レビュー記録を検証する型ガード。
 * - staffing-or-delivery-capacity を含む場合、その根拠資料が存在することまで検証する。
 */
export function validatePolicyReviewFile(value: unknown): PolicyReviewValidationResult {
  const errors: string[] = [];
  if (typeof value !== "object" || value == null) {
    return { valid: false, errors: ["ファイル全体がオブジェクトではありません"] };
  }
  const file = value as { records?: unknown };
  if (!Array.isArray(file.records)) {
    return { valid: false, errors: ["records は配列である必要があります"] };
  }
  const seenIds = new Set<string>();
  for (const entry of file.records) {
    if (typeof entry !== "object" || entry == null) {
      errors.push("records の要素はオブジェクトです");
      continue;
    }
    const record = entry as Partial<PolicyReviewRecord>;
    const id = typeof record.reviewId === "string" ? record.reviewId : "(idなし)";
    if (typeof id !== "string" || id.length === 0 || id === "(idなし)") {
      errors.push("reviewId が必要です");
    } else if (seenIds.has(id)) {
      errors.push(`reviewId が重複しています: ${id}`);
    }
    seenIds.add(id);
    if (typeof record.comparisonId !== "string") errors.push(`${id}: comparisonId が必要です`);
    if (typeof record.policyTitle !== "string") errors.push(`${id}: policyTitle が必要です`);
    if (!CONFIRMATION_STATUSES.includes(record.reasonStatus as string)) {
      errors.push(`${id}: reasonStatus が不正です`);
    }
    if (!CONFIRMATION_STATUSES.includes(record.improvementStatus as string)) {
      errors.push(`${id}: improvementStatus が不正です`);
    }
    if (!EXECUTION_METHODS.includes(record.executionMethod as string)) {
      errors.push(`${id}: executionMethod が不正です`);
    }
    for (const tag of record.reasonTags ?? []) {
      if (!REASON_TAGS.includes(tag as string)) {
        errors.push(`${id}: 不明な理由タグです: ${String(tag)}`);
      }
    }
    // staffing-or-delivery-capacity は公式資料への根拠が必須（使用上の規律を検証で担保）
    if ((record.reasonTags ?? []).includes("staffing-or-delivery-capacity")) {
      const references = record.evidenceReferences ?? [];
      if (references.length === 0) {
        errors.push(
          `${id}: staffing-or-delivery-capacity には公式資料の根拠が必須です（明記がある場合のみ使用可）`,
        );
      }
    }
    if (record.reasonTags != null && (record.reasonTags.length > 0) && record.reasonStatus !== "confirmed") {
      errors.push(`${id}: タグはreasonStatus=confirmedの場合のみ付けられます`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/** 重点レビュー記録1件 */
export interface PolicyReviewRecord {
  /** レビューID（例: rev-0001） */
  reviewId: string;
  /** 対応する比較レコードID（budget-comparisons.json の comparisonId） */
  comparisonId: string;
  /** 政策・事業タイトル（原本表記） */
  policyTitle: string;
  /** 局名（2026年度側の原文表記。不明なら空文字ではなくnull） */
  bureau: string | null;
  /** 執行方式 */
  executionMethod: ExecutionMethod;
  /** 公式資料に基づく事業説明の要旨 */
  officialDescription: string;
  /** 低執行理由の確認状態 */
  reasonStatus: ConfirmationStatus;
  /** 低執行理由タグ（reasonStatus=confirmed の場合のみ使用可） */
  reasonTags: LowExecutionReasonTag[];
  /** 改善策の確認状態 */
  improvementStatus: ConfirmationStatus;
  /** 改善策の要旨（confirmed の場合）。not-found/not-applicable なら空文字 */
  improvementSummary: string;
  /** 根拠となる公式資料一覧 */
  evidenceReferences: PolicyEvidenceReference[];
  /** レビュアーの確認メモ（事実確認の過程を記録し、推測を含まない） */
  reviewerNotes: string;
}
