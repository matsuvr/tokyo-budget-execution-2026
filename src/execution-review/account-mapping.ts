import type { MappingConfidence } from "./types.ts";

/**
 * 2024年度決算科目と2026年度予算科目の年度間対応表（Issue #22）。
 * - 年度間の名称変更・組織再編を、曖昧な自動結合ではなく監査可能な対応表で管理する。
 * - one-to-many / many-to-one は各年度側のキー配列で表現する。
 * - 対応信頼度 A/B のレコードのみが要説明候補の集計に入る。C/unmatched は参考扱い。
 */

/** 比較粒度。双方の公式資料で確認できる最小共通粒度を使う。 */
export type MappingGranularity = "chapter" | "item" | "object";

/** 対応種別 */
export type MappingRelationType =
  | "exact" // 名称・範囲とも変更なし
  | "renamed" // 名称変更（範囲は同一）
  | "merged" // 複数科目の統合
  | "split" // 科目の分割
  | "discontinued" // 2026年度に対応が存在しない
  | "unknown"; // 未確認

/** 単一年度側の科目キー。階層は上から順に省略できる（最小共通粒度へ集約）。 */
export interface MappingAccountKey {
  /** 会計（例: 一般会計） */
  account: string;
  /** 款（例: "02:総務費" のような安定キー形式） */
  chapter: string;
  /** 項。粒度がchapterの場合は省略 */
  section?: string;
  /** 目。粒度がchapter/sectionの場合は省略 */
  item?: string;
}

/** 対応表1レコード */
export interface AccountMappingRecord {
  /** マッピングID（例: map-0001）。ファイル内で一意。 */
  mappingId: string;
  /** 2024年度（決算）側のキー。1件以上。 */
  fiscalYear2024: MappingAccountKey[];
  /** 2026年度（予算）側のキー。unmatched以外は1件以上。 */
  fiscalYear2026: MappingAccountKey[];
  /** 比較粒度 */
  granularity: MappingGranularity;
  /**
   * 対応信頼度。
   * - A: 完全一致（会計・款・項・目が双方で確認できる）
   * - B: 改称・統合等の人手確認（20件上限）
   * - C: 推定・曖昧な対応（要説明候補の集計対象外）
   * - unmatched: 対応不能
   * A/Bのみが要説明候補の集計に入る。
   */
  confidence: MappingConfidence;
  /** 対応種別 */
  relationType: MappingRelationType;
  /** 根拠となる公式資料 */
  evidence: {
    title: string;
    /** 東京都公式配下のURL */
    url: string;
    page: number | null;
  };
  /** 人手確認メモ */
  note?: string;
}

/** 対応表ファイル全体。data/manual/execution-review/account-mapping.json の形式。 */
export interface AccountMappingFile {
  version: 1;
  updatedAt: string;
  mappings: AccountMappingRecord[];
}

export interface AccountMappingValidationResult {
  valid: boolean;
  errors: string[];
}

const GRANULARITIES: readonly string[] = ["chapter", "item", "object"];
const CONFIDENCES: readonly string[] = ["A", "B", "C", "unmatched"];
const RELATION_TYPES: readonly string[] = [
  "exact",
  "renamed",
  "merged",
  "split",
  "discontinued",
  "unknown",
];

function validateAccountKeys(
  keys: unknown,
  fieldName: string,
  mappingId: string,
  errors: string[],
  required: boolean,
): void {
  if (!Array.isArray(keys)) {
    errors.push(`${mappingId}: ${fieldName} は配列である必要があります`);
    return;
  }
  if (required && keys.length === 0) {
    errors.push(`${mappingId}: ${fieldName} は1件以上必要です`);
  }
  for (const entry of keys) {
    if (typeof entry !== "object" || entry == null) {
      errors.push(`${mappingId}: ${fieldName} の要素はオブジェクトです`);
      continue;
    }
    const key = entry as Partial<MappingAccountKey>;
    if (typeof key.account !== "string" || key.account.length === 0) {
      errors.push(`${mappingId}: ${fieldName}.account が必要です`);
    }
    if (typeof key.chapter !== "string" || key.chapter.length === 0) {
      errors.push(`${mappingId}: ${fieldName}.chapter が必要です`);
    }
  }
}

/**
 * 対応表ファイルを検証する純粋関数。
 */
export function validateAccountMappingFile(value: unknown): AccountMappingValidationResult {
  const errors: string[] = [];
  if (typeof value !== "object" || value == null) {
    return { valid: false, errors: ["ファイル全体がオブジェクトではありません"] };
  }
  const file = value as Partial<AccountMappingFile>;
  if (file.version !== 1) errors.push("version は 1 である必要があります");
  if (typeof file.updatedAt !== "string") errors.push("updatedAt が必要です");
  if (!Array.isArray(file.mappings)) {
    errors.push("mappings は配列である必要があります");
    return { valid: false, errors };
  }
  const seenIds = new Set<string>();
  for (const mapping of file.mappings) {
    if (typeof mapping !== "object" || mapping == null) {
      errors.push("mappings の要素はオブジェクトです");
      continue;
    }
    const id = typeof mapping.mappingId === "string" ? mapping.mappingId : "(idなし)";
    if (typeof mapping.mappingId !== "string" || mapping.mappingId.length === 0) {
      errors.push("mappingId が必要です");
    } else if (seenIds.has(mapping.mappingId)) {
      errors.push(`mappingId が重複しています: ${mapping.mappingId}`);
    }
    seenIds.add(id);
    if (!GRANULARITIES.includes(mapping.granularity as string)) {
      errors.push(`${id}: granularity が不正です`);
    }
    if (!CONFIDENCES.includes(mapping.confidence as string)) {
      errors.push(`${id}: confidence が不正です`);
    }
    if (!RELATION_TYPES.includes(mapping.relationType as string)) {
      errors.push(`${id}: relationType が不正です`);
    }
    const isUnmatched = mapping.confidence === "unmatched";
    validateAccountKeys(mapping.fiscalYear2024, "fiscalYear2024", id, errors, true);
    validateAccountKeys(
      mapping.fiscalYear2026,
      "fiscalYear2026",
      id,
      errors,
      !isUnmatched,
    );
    if (
      typeof mapping.evidence !== "object" ||
      mapping.evidence == null ||
      typeof mapping.evidence.url !== "string"
    ) {
      errors.push(`${id}: evidence.url が必要です`);
    }
  }
  return { valid: errors.length === 0, errors };
}
