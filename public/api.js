export const API_ENDPOINTS = {
    executionReviewIndex: "/execution-review",
    executionReviewCandidates: "/execution-review/candidates",
    executionReviewBureaus: "/execution-review/bureaus",
    executionReviewItem: "/execution-review/items",
    executionAttentionItems: "/execution-review/attention-items",
    executionAttentionItem: "/execution-review/attention-items",
    executionAttentionBureaus: "/execution-review/attention-bureaus",
};
export class ApiError extends Error {
    status;
    cause;
    constructor(message, options = {}) {
        super(message);
        this.name = "ApiError";
        this.status = options.status ?? null;
        if (options.cause !== undefined)
            this.cause = options.cause;
    }
}
export async function fetchJson(url, options = {}) {
    let response;
    try {
        response = await fetch(url, { signal: options.signal });
    }
    catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
            throw error;
        throw new ApiError("ネットワークエラーでデータを取得できませんでした", { cause: error });
    }
    if (!response.ok) {
        const status = response.status;
        if (status === 404)
            throw new ApiError("データが見つかりませんでした", { status });
        throw new ApiError(`データの取得に失敗しました（HTTP ${status}）`, { status });
    }
    try {
        return (await response.json());
    }
    catch (error) {
        throw new ApiError("サーバー応答が正しいJSONではありませんでした", { cause: error });
    }
}
export function fetchExecutionReviewIndex(options = {}) {
    return fetchJson(API_ENDPOINTS.executionReviewIndex, options);
}
export function fetchExecutionAttentionItems(options = {}) {
    return fetchJson(API_ENDPOINTS.executionAttentionItems, options);
}
export function fetchExecutionAttentionDetail(itemId, options = {}) {
    return fetchJson(`${API_ENDPOINTS.executionAttentionItem}/${encodeURIComponent(itemId)}`, options);
}
export function fetchAttentionBureauSummary(options = {}) {
    return fetchJson(API_ENDPOINTS.executionAttentionBureaus, options);
}
/* Legacy clients retained during migration. */
export function fetchReviewCandidates(options = {}) {
    return fetchJson(API_ENDPOINTS.executionReviewCandidates, options);
}
export function fetchBureauSummary(options = {}) {
    return fetchJson(API_ENDPOINTS.executionReviewBureaus, options);
}
export function fetchPolicyReviewDetail(reviewId, options = {}) {
    return fetchJson(`${API_ENDPOINTS.executionReviewItem}/${encodeURIComponent(reviewId)}`, options);
}
