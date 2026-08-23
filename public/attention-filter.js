export const ALL = "all";
export function defaultAttentionFilters() {
    return {
        scope: "operational",
        bureau: ALL,
        executionMethod: ALL,
        gapComposition: ALL,
        comparison: "all",
        signal: ALL,
    };
}
export function clearAttentionFilters() { return defaultAttentionFilters(); }
function matches(item, filters) {
    if (filters.scope !== ALL && item.reviewScope !== filters.scope)
        return false;
    if (filters.bureau !== ALL && item.bureau !== filters.bureau)
        return false;
    if (filters.executionMethod !== ALL && item.executionMethod !== filters.executionMethod)
        return false;
    if (filters.gapComposition !== ALL && item.gapComposition !== filters.gapComposition)
        return false;
    if (filters.comparison === "attached" && item.comparison == null)
        return false;
    if (filters.comparison === "unavailable" && item.comparison != null)
        return false;
    if (filters.signal !== ALL && !item.attentionFlags.includes(filters.signal))
        return false;
    return true;
}
export function applyAttentionFilters(records, filters) {
    return records.filter((item) => matches(item, filters));
}
export function sortAttentionItems(records, sort) {
    const copy = [...records];
    copy.sort((a, b) => {
        let result = 0;
        if (sort === "unexecuted-amount-desc") {
            result = b.amounts.yearEndUnexecutedYen - a.amounts.yearEndUnexecutedYen;
        }
        else if (sort === "unexecuted-rate-desc") {
            const left = a.rates.yearEndUnexecutedRate;
            const right = b.rates.yearEndUnexecutedRate;
            if (left == null && right != null)
                result = 1;
            else if (left != null && right == null)
                result = -1;
            else if (left != null && right != null)
                result = right - left;
        }
        else if (sort === "current-budget-desc") {
            result = b.amounts.currentBudgetYen - a.amounts.currentBudgetYen;
        }
        else {
            result = a.itemId.localeCompare(b.itemId, "ja");
        }
        return result || a.itemId.localeCompare(b.itemId, "ja");
    });
    return copy;
}
export function availableValues(records, key) {
    return [...new Set(records.map((record) => record[key]))].sort((a, b) => a.localeCompare(b, "ja"));
}
