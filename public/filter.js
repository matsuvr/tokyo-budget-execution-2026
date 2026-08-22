export const ALL = "all";
export function defaultFilters() {
    return { status: "needs-explanation", bureau: ALL, confidences: ["A", "B"] };
}
/** 局名の代わりに使う2024年度の款名（番号接頭辞を除す） */
export function bureauOfCandidate(candidate) {
    const chapter = candidate.fy2024Keys[0]?.chapter ?? "(不明)";
    return chapter.replace(/^[0-9]{1,2}:/u, "");
}
function matches(candidate, filters) {
    if (filters.status !== ALL && candidate.status !== filters.status)
        return false;
    if (filters.bureau !== ALL && bureauOfCandidate(candidate) !== filters.bureau)
        return false;
    if (filters.confidences.length > 0 && !filters.confidences.includes(candidate.confidence)) {
        return false;
    }
    return true;
}
/** 複数条件をANDで適用する。入力配列は変更せず、順序を保った新しい配列を返す */
export function applyCandidateFilters(records, filters) {
    return records.filter((record) => matches(record, filters));
}
/** 一覧に現れる局名（款名）の一覧を昇順・重複なしで返す */
export function availableBureaus(records) {
    const set = new Set();
    for (const record of records)
        set.add(bureauOfCandidate(record));
    return [...set].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
