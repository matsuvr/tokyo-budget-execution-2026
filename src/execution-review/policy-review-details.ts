import type { ConfirmationStatus, PolicyEvidenceReference } from "./policy-review-types.ts";
import type { ExecutionMethod, ReviewStatus } from "./types.ts";

/**
 * 重点レビュー詳細（Issue #40）のデータ契約と統合・検証ロジック。
 *
 * - selected候補ごとに、公式事実(review)、分析上の判定(analysis)、
 *   公金支出の補助証拠(paymentEvidence)を別フィールドで保持する。
 * - レビューがない候補（executionMethod=unknown）は review を null のまま残す。
 * - 支払補助証拠がない候補は paymentEvidence を null で保持する。
 */

export const REVIEW_TARGET_METHODS: readonly ExecutionMethod[] = [
  "direct",
  "procurement",
  "construction",
  "subsidy",
];

/** 公金支出の補助証拠サマリー（#33の出力から表示用に必要な部分） */
export interface PaymentEvidenceSummary {
  transactionCount: number;
  totalAmountYen: number;
  ordinaryAmountYen: number;
  closingAmountYen: number;
  topPaymentNames: readonly { name: string; count: number; amountYen: number }[];
}

export interface SelectionCandidateInput {
  comparisonId: string | null;
  mappingId: string;
  policyTitle: string;
  bureau: string | null;
  executionMethod: ExecutionMethod;
  selectionReason: string;
}

export interface CandidateRowInput {
  comparisonId: string | null;
  mappingId: string;
  confidence: string;
  granularity: string;
  status: string;
  statusReasons: readonly string[];
  amounts: {
    fy2024InitialBudgetYen: number | null;
    fy2024CurrentBudgetYen: number | null;
    fy2024SpentYen: number | null;
    fy2024CarryoverYen: number | null;
    fy2024UnusedYen: number | null;
    fy2026InitialBudgetYen: number | null;
  };
  rates: {
    executionRate: number | null;
    carryoverRate: number | null;
    unusedRate: number | null;
    budgetContinuationRate: number | null;
  };
}

export interface PaymentCandidateInput {
  comparisonId: string;
  transactionCount: number;
  totalAmountYen: number;
  ordinaryAmountYen: number;
  closingAmountYen: number;
  topPaymentNames: readonly { name: string; count: number; amountYen: number }[];
}

export interface PolicyReviewDetailRecord {
  /** 対応するレビューID。未レビューならnull */
  reviewId: string | null;
  comparisonId: string;
  mappingId: string;
  policyTitle: string;
  bureau: string | null;
  confidence: string;
  granularity: string;
  executionMethod: ExecutionMethod;
  /** 分析上の判定（#29〜#31のパイプライン出力） */
  analysis: {
    status: ReviewStatus | string;
    statusReasons: readonly string[];
    selectionReason: string;
    rates: CandidateRowInput["rates"];
    amounts: CandidateRowInput["amounts"];
  };
  /** 公式事実（#34のレビュー記録）。未レビューならnull */
  review: {
    officialDescription: string;
    reasonStatus: ConfirmationStatus;
    reasonTags: readonly string[];
    improvementStatus: ConfirmationStatus;
    improvementSummary: string;
    evidenceReferences: readonly PolicyEvidenceReference[];
    reviewerNotes: string;
  } | null;
  /** 公金支出の補助証拠（#33）。支払実績がなければnull */
  paymentEvidence: PaymentEvidenceSummary | null;
}

export interface BuildPolicyReviewDetailsResult {
  errors: string[];
  records: PolicyReviewDetailRecord[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null;
}

/**
 * 統合・検証の純粋関数。検証エラーが1件でもあれば errors を非空で返す。
 * - selectedカテゴリ候補（direct/procurement/construction/subsidy）にはレビューがちょうど1件必須。
 *   unknown候補は対象外（review=null）で、レビューが付いていればエラー。
 * - comparisonId は選定ファイル・候補ファイル間で参照整合が必要。
 * - 執行方式は選定時と一致しなければならない。
 * - confirmed には公式根拠が必須。not-found/not-applicable を空文字やconfirmedとして扱わない。
 */
export function buildPolicyReviewDetails(inputs: {
  selections: readonly SelectionCandidateInput[];
  reviewFiles: Record<string, unknown>;
  candidates: readonly CandidateRowInput[];
  paymentCandidates: readonly PaymentCandidateInput[];
}): BuildPolicyReviewDetailsResult {
  const errors: string[] = [];
  const records: PolicyReviewDetailRecord[] = [];

  // 候補行を mappingId / comparisonId で索引化
  const candidateByMapping = new Map<string, CandidateRowInput>();
  for (const row of inputs.candidates) {
    candidateByMapping.set(row.mappingId, row);
  }

  // レビューを統合し重複・参照切れを検出
  const reviewByComparison = new Map<string, { method: string; record: Record<string, unknown> }>();
  for (const [fileName, file] of Object.entries(inputs.reviewFiles)) {
    if (!isRecord(file) || !Array.isArray(file.records)) {
      errors.push(`${fileName}: records 配列が必要です`);
      continue;
    }
    for (const entry of file.records) {
      if (!isRecord(entry)) continue;
      const id = typeof entry.comparisonId === "string" ? entry.comparisonId : "(idなし)";
      if (!inputs.selections.some((s) => s.comparisonId === id)) {
        errors.push(`${fileName}: 選定ファイルに存在しない comparisonId へのレビュー: ${id}`);
        continue;
      }
      if (reviewByComparison.has(id)) {
        errors.push(`${fileName}: comparisonId ${id} に複数のレビューがある`);
        continue;
      }
      reviewByComparison.set(id, {
        method: typeof entry.executionMethod === "string" ? entry.executionMethod : "",
        record: entry,
      });
    }
  }

  const paymentByComparison = new Map<string, PaymentEvidenceSummary>();
  for (const p of inputs.paymentCandidates) {
    if (p.transactionCount > 0) {
      paymentByComparison.set(p.comparisonId, {
        transactionCount: p.transactionCount,
        totalAmountYen: p.totalAmountYen,
        ordinaryAmountYen: p.ordinaryAmountYen,
        closingAmountYen: p.closingAmountYen,
        topPaymentNames: [...p.topPaymentNames],
      });
    }
  }

  for (const selection of inputs.selections) {
    if (selection.comparisonId == null) {
      errors.push(`mappingId ${selection.mappingId}: 選定候補に comparisonId がない`);
      continue;
    }
    const comparisonId = selection.comparisonId;
    const candidate = candidateByMapping.get(selection.mappingId);
    if (candidate == null || candidate.comparisonId !== comparisonId) {
      errors.push(`comparisonId ${comparisonId}: 候補ファイルに対応する行がない（参照切れ）`);
      continue;
    }

    const reviewEntry = reviewByComparison.get(comparisonId);
    let review: PolicyReviewDetailRecord["review"] = null;
    let reviewId: string | null = null;

    const isTargetMethod = (REVIEW_TARGET_METHODS as readonly string[]).includes(
      selection.executionMethod,
    );
    if (isTargetMethod && reviewEntry == null) {
      errors.push(`comparisonId ${comparisonId}: カテゴリ候補なのにレビューがない`);
    } else if (!isTargetMethod && reviewEntry != null) {
      errors.push(`comparisonId ${comparisonId}: unknown等の候補にレビューが付いている`);
    } else if (reviewEntry != null && reviewEntry.method !== selection.executionMethod) {
      errors.push(
        `comparisonId ${comparisonId}: 執行方式が選定時(${selection.executionMethod})と不一致(${reviewEntry.method})`,
      );
    } else if (reviewEntry != null) {
      const r = reviewEntry.record;
      reviewId = typeof r.reviewId === "string" ? r.reviewId : null;
      const reasonStatus = r.reasonStatus as ConfirmationStatus;
      const improvementStatus = r.improvementStatus as ConfirmationStatus;
      const evidence = Array.isArray(r.evidenceReferences) ? r.evidenceReferences : [];
      // confirmed には公式根拠が必須
      if ((reasonStatus === "confirmed" || improvementStatus === "confirmed") && evidence.length === 0) {
        errors.push(`comparisonId ${comparisonId}: confirmed なのに公式根拠がない`);
      }
      // not-found / not-applicable を空文字や confirmed として扱わない
      if (reasonStatus !== "confirmed") {
        const tags = Array.isArray(r.reasonTags) ? r.reasonTags : [];
        if (tags.length > 0) {
          errors.push(`comparisonId ${comparisonId}: confirmed以外なのに理由タグがある`);
        }
      }
      if (improvementStatus !== "confirmed" && r.improvementSummary !== "") {
        errors.push(`comparisonId ${comparisonId}: confirmed以外なのに改善策の要旨がある`);
      }
      review = {
        officialDescription: String(r.officialDescription ?? ""),
        reasonStatus,
        reasonTags: [...((r.reasonTags as readonly string[]) ?? [])],
        improvementStatus,
        improvementSummary: String(r.improvementSummary ?? ""),
        evidenceReferences: [...evidence],
        reviewerNotes: String(r.reviewerNotes ?? ""),
      };
    }

    records.push({
      reviewId,
      comparisonId,
      mappingId: selection.mappingId,
      policyTitle: selection.policyTitle,
      bureau: selection.bureau,
      confidence: candidate.confidence,
      granularity: candidate.granularity,
      executionMethod: selection.executionMethod,
      analysis: {
        status: candidate.status,
        statusReasons: [...candidate.statusReasons],
        selectionReason: selection.selectionReason,
        rates: candidate.rates,
        amounts: candidate.amounts,
      },
      review,
      paymentEvidence: paymentByComparison.get(comparisonId) ?? null,
    });
  }

  return { errors, records };
}
