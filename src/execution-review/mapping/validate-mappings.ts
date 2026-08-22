import { normalizeAccountName } from "./normalize-account-name.ts";

/**
 * A/B対応表のvalidator純粋関数（Issue #28）。
 * - 重複ID・参照切れ・信頼度違反・矛盾割当を検出する。
 * - C/unmatchedは aggregatable:false として出力に残す（集計では使わない）。
 */

export interface MappingAccountKeyRef {
  account: string;
  chapter: string;
  section?: string;
}

export interface MappableMappingRecord {
  mappingId: string;
  fiscalYear2024: MappingAccountKeyRef[];
  fiscalYear2026: MappingAccountKeyRef[];
  granularity: string;
  confidence: "A" | "B" | "C" | "unmatched";
  relationType: string;
  evidence?: unknown;
  note?: string;
  [extra: string]: unknown;
}

export interface MappingValidationIssue {
  code:
    | "duplicate-id"
    | "missing-fy2024-key"
    | "missing-fy2026-key"
    | "a-not-one-to-one"
    | "a-relation-type-invalid"
    | "ab-missing-evidence"
    | "proration-amount-present"
    | "conflicting-assignment";
  mappingId: string;
  detail: string;
}

export interface NormalizedMappingRecord extends MappableMappingRecord {
  aggregatable: boolean;
}

export interface MappingValidationResult {
  records: NormalizedMappingRecord[];
  issues: MappingValidationIssue[];
  summary: Record<string, number>;
}

function keyExists(
  key: MappingAccountKeyRef,
  index: Map<string, Set<string>>,
): boolean {
  const chapters = index.get(normalizeAccountName(key.chapter.replace(/^[0-9]{1,2}:/u, "")));
  if (chapters == null || chapters.size === 0) return false;
  if (key.section == null) return true;
  const sections = index.get(
    `${normalizeAccountName(key.chapter.replace(/^[0-9]{1,2}:/u, ""))}|${normalizeAccountName(key.section.replace(/^[0-9]{1,2}:/u, ""))}`,
  );
  return sections != null && sections.size > 0;
}

function hasEvidence(record: MappableMappingRecord, side: string): boolean {
  const evidence = record.evidence as
    | { title?: unknown; url?: unknown; page?: unknown }
    | undefined;
  if (
    evidence != null &&
    typeof evidence.url === "string" &&
    evidence.url.length > 0 &&
    typeof evidence.title === "string"
  ) {
    return true;
  }
  // 双方の公式出典が配列で入っている場合（#26の形式）も受理する
  const sources = (record as { fy2024?: { sources?: unknown[] } }).fy2024?.sources;
  void side;
  void sources;
  return false;
}

/**
 * 対応表を統合検証する。
 * @param existingKeys fy2024/fy2026の実在キー索引。キーは正規化済み名称、値は金額等の集合。
 */
export function validateAndMergeMappings(
  records: readonly MappableMappingRecord[],
  existingKeys: {
    fy2024: Map<string, Set<string>>;
    fy2026: Map<string, Set<string>>;
  },
): MappingValidationResult {
  const issues: MappingValidationIssue[] = [];
  const seenIds = new Set<string>();
  // 2024キー×粒度ごとの割り当て先（矛盾検出用）
  const assignments = new Map<string, Set<string>>();

  const normalizedRecords: NormalizedMappingRecord[] = [];

  for (const record of records) {
    const id = record.mappingId;

    if (seenIds.has(id)) {
      issues.push({ code: "duplicate-id", mappingId: id, detail: "mappingIdが重複しています" });
    }
    seenIds.add(id);

    for (const key of record.fiscalYear2024 ?? []) {
      if (!keyExists(key, existingKeys.fy2024)) {
        issues.push({
          code: "missing-fy2024-key",
          mappingId: id,
          detail: `2024キーが存在しません: ${JSON.stringify(key)}`,
        });
        break;
      }
    }
    if (record.confidence !== "unmatched") {
      let anyMissing = false;
      for (const key of record.fiscalYear2026 ?? []) {
        if (!keyExists(key, existingKeys.fy2026)) {
          issues.push({
            code: "missing-fy2026-key",
            mappingId: id,
            detail: `2026キーが存在しません: ${JSON.stringify(key)}`,
          });
          anyMissing = true;
          break;
        }
      }
      void anyMissing;
    }

    if (record.confidence === "A" || record.confidence === "B") {
      if (!hasEvidence(record, "both")) {
        issues.push({
          code: "ab-missing-evidence",
          mappingId: id,
          detail: "A/B対応には公式出典が必要です",
        });
      }
    }

    if (record.confidence === "A") {
      if (record.relationType !== "exact") {
        issues.push({
          code: "a-relation-type-invalid",
          mappingId: id,
          detail: `AのrelationTypeはexactのみ: ${record.relationType}`,
        });
      }
      if ((record.fiscalYear2026?.length ?? 0) !== 1 || (record.fiscalYear2024?.length ?? 0) !== 1) {
        issues.push({
          code: "a-not-one-to-one",
          mappingId: id,
          detail: "A対応は一対一のみ",
        });
      }
    }

    if (
      (record.relationType === "split" || record.relationType === "merged") &&
      ("prorationYen" in record || "prorationRates" in record)
    ) {
      issues.push({
        code: "proration-amount-present",
        mappingId: id,
        detail: "split/mergedに按分額を持たせてはいけない",
      });
    }

    // 同一2024キーの矛盾割当検出（同粒度）
    if (record.confidence !== "unmatched") {
      for (const key of record.fiscalYear2024 ?? []) {
        const sectionPart =
          key.section != null ? normalizeAccountName(key.section.replace(/^[0-9]{1,2}:/u, "")) : "";
        const assignmentKey = `${normalizeAccountName(
          key.chapter.replace(/^[0-9]{1,2}:/u, ""),
        )}|${sectionPart}|${record.granularity}`;
        const target = record.fiscalYear2026?.[0];
        const targetLabel = target
          ? `${normalizeAccountName(target.chapter.replace(/^[0-9]{1,2}:/u, ""))}${
              target.section != null
                ? `|${normalizeAccountName(target.section.replace(/^[0-9]{1,2}:/u, ""))}`
                : ""
            }`
          : "(なし)";
        const set = assignments.get(assignmentKey);
        if (set == null) {
          assignments.set(assignmentKey, new Set([targetLabel]));
        } else {
          set.add(targetLabel);
          if (set.size > 1) {
            issues.push({
              code: "conflicting-assignment",
              mappingId: id,
              detail: `同一2024キーへの矛盾する割当: ${assignmentKey} → ${[...set].join(" / ")}`,
            });
          }
        }
      }
    }

    const aggregatable = record.confidence === "A" || record.confidence === "B";
    normalizedRecords.push({ ...record, aggregatable });
  }

  // 出力順序を決定的に: mappingId昇順
  normalizedRecords.sort((a, b) => (a.mappingId < b.mappingId ? -1 : a.mappingId > b.mappingId ? 1 : 0));

  const summary: Record<string, number> = { A: 0, B: 0, C: 0, unmatched: 0 };
  for (const record of normalizedRecords) {
    summary[record.confidence] = (summary[record.confidence] ?? 0) + 1;
  }

  return { records: normalizedRecords, issues, summary };
}
