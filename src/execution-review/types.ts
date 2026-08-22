/**
 * 執行レビュー（2024年度正式決算 → 2026年度予算）で使うドメイン型。
 *
 * - 金額はすべて円の整数（Yen）で保持する。表示時のみ兆円・億円へ整形する。
 * - 比率は 0〜1 の number、欠損は null（0で補完しない）。
 * - 原本に根拠がある場合のみ原因タグを付ける。推測しない。
 */

import type { FiscalYear } from "../types.ts";

/**
 * 会計・款・項・目を表す安定キー。
 * - 各要素は原本の表記を正規化した文字列。
 * - `key` は `account:chapter:section:item` の連結で一意に決まる。
 */
export interface ExecutionAccountKey {
  /** 会計（例: 一般会計） */
  account: string;
  /** 款 */
  chapter: string;
  /** 項 */
  section: string;
  /** 目 */
  item: string;
  /** 安定キー: account:chapter:section:item */
  key: string;
}

/**
 * 執行方式。公金支出や予算説明から分類する。
 * - direct: 直営・行政サービス
 * - procurement: 委託・調達
 * - construction: 工事・施設整備
 * - subsidy: 補助・給付
 * - statutory-transfer: 法定移転・税連動・会計間移転
 * - unknown: 分類不能（推測しない）
 */
export type ExecutionMethod =
  | "direct"
  | "procurement"
  | "construction"
  | "subsidy"
  | "statutory-transfer"
  | "unknown";

/**
 * 対応信頼度。政策レビュー集計では A/B のみを要説明候補に使う。
 * - A: 完全一致（会計・款・項・目が双方で確認できる）
 * - B: 改称・統合等の人手対応で確認（20件上限）
 * - C: 推定・曖昧な対応（集計対象外）
 * - unmatched: 対応不能（nullで残すのと同義）
 */
export type MappingConfidence = "A" | "B" | "C" | "unmatched";

/**
 * 執行レビューの表示状態。
 * - needs-explanation: 要説明候補（低執行＋予算継続）
 * - carryover: 遅延・繰越
 * - review-reflected: 見直し反映（予算減・廃止等）
 * - executed: 執行済み
 * - incomparable: 比較不能（対応不能・欠損等）
 */
export type ReviewStatus =
  | "needs-explanation"
  | "carryover"
  | "review-reflected"
  | "executed"
  | "incomparable";

/**
 * 公式資料への参照。原文の長文引用は保存せず要旨とページを残す。
 */
export interface EvidenceReference {
  /** 資料名（例: 令和6年度一般会計歳入歳出決算事項別明細書） */
  title: string;
  /** 東京都公式配下の URL（metro.tokyo.lg.jp） */
  url: string;
  /** ページ番号（PDFの場合）、不明なら null */
  page: number | null;
  /** 要旨（引用ではなく要約） */
  summary: string;
}

/**
 * 2024年度の決算執行実績1件。
 * 金額はすべて円の整数。不明な当初予算は null で残す（0で補完しない）。
 */
export interface ExecutionRecord {
  /** 対象年度（固定で 2024） */
  fiscalYear: Extract<FiscalYear, 2024>;
  /** 局名 */
  bureau: string;
  /** 会計・款・項・目の安定キー */
  accountKey: ExecutionAccountKey;
  /** 2024年度当初予算（円）、不明なら null */
  initialBudgetYen: number | null;
  /** 2024年度予算現額（円） */
  currentBudgetYen: number;
  /** 2024年度支出済額（円） */
  spentYen: number;
  /** 2024年度翌年度繰越額（円） */
  carryoverYen: number;
  /** 2024年度不用額（円） */
  unusedYen: number;
  /** 出典ページ（決算書内）、不明なら null */
  sourcePage: number | null;
  /** 出典資料への参照 */
  source: EvidenceReference;
  /** 執行方式（不明なら unknown） */
  executionMethod: ExecutionMethod;
}

/**
 * 2024年度決算科目と 2026年度予算科目の年度間比較1件。
 * 金額はすべて円の整数、比率は 0〜1 または null。
 */
export interface BudgetComparisonRecord {
  /** 安定した比較ID（例: general:chapter:section:item） */
  comparisonId: string;
  /** 2024年度のキー（対応不能なら null） */
  accountKey2024: ExecutionAccountKey | null;
  /** 2026年度のキー（対応不能なら null） */
  accountKey2026: ExecutionAccountKey | null;
  /** 比較粒度: chapter(款) / section(項) / item(目) / unmatched */
  comparisonUnit: "chapter" | "section" | "item" | "unmatched";
  /** 2024年度当初予算（円）、欠損は null */
  budget2024InitialYen: number | null;
  /** 2025年度当初予算（円）、欠損は null */
  budget2025InitialYen: number | null;
  /** 2026年度当初予算（円）、欠損は null */
  budget2026InitialYen: number | null;
  /** 対応信頼度 */
  mappingConfidence: MappingConfidence;
  /** 2024年度執行実績（対応不能なら null） */
  execution2024: ExecutionRecord | null;
  /** 算出済み比率（欠損なら null） */
  executionRate: number | null;
  carryoverRate: number | null;
  unusedRate: number | null;
  budgetContinuationRate: number | null;
  /** 最終的な表示状態 */
  reviewStatus: ReviewStatus;
  /** 判定理由の短文 */
  reason: string;
}
