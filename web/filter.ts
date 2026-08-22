import type { ReviewCandidateView } from "./types.js";

/**
 * 候補一覧のクライアント側フィルター（Issue #50）。
 * DOMに依存しない純粋関数として実装し、複数条件はANDで適用する。
 * 注意: 本モジュールはNode標準テストから直接読まれるため、runtime importを持たないこと。
 */

export interface CandidateFilters {
  /** 状態。status値または"all" */
  status: string;
  /** 局名（款名）。"all"で絞り込みなし */
  bureau: string;
  /** 対応信頼度の集合。空配列=絞り込みなしにはしない（UIからは必ず1つ以上選択） */
  confidences: readonly string[];
}

export const ALL = "all";

export function defaultFilters(): CandidateFilters {
  return { status: "needs-explanation", bureau: ALL, confidences: ["A", "B"] };
}

/** 「条件をリセット」相当。すべての条件を解除して全件表示に戻す */
export function clearFilters(): CandidateFilters {
  return { status: ALL, bureau: ALL, confidences: [] };
}

/** 局名の代わりに使う2024年度の款名（番号接頭辞を除す） */
export function bureauOfCandidate(candidate: ReviewCandidateView): string {
  const chapter = candidate.fy2024Keys[0]?.chapter ?? "(不明)";
  return chapter.replace(/^[0-9]{1,2}:/u, "");
}

function matches(candidate: ReviewCandidateView, filters: CandidateFilters): boolean {
  if (filters.status !== ALL && candidate.status !== filters.status) return false;
  if (filters.bureau !== ALL && bureauOfCandidate(candidate) !== filters.bureau) return false;
  if (filters.confidences.length > 0 && !filters.confidences.includes(candidate.confidence)) {
    return false;
  }
  return true;
}

/** 複数条件をANDで適用する。入力配列は変更せず、順序を保った新しい配列を返す */
export function applyCandidateFilters(
  records: readonly ReviewCandidateView[],
  filters: CandidateFilters,
): ReviewCandidateView[] {
  return records.filter((record) => matches(record, filters));
}

/** 一覧に現れる局名（款名）の一覧を昇順・重複なしで返す */
export function availableBureaus(records: readonly ReviewCandidateView[]): string[] {
  const set = new Set<string>();
  for (const record of records) set.add(bureauOfCandidate(record));
  return [...set].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
