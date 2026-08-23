import type {
  AttentionBureauSummaryView,
  BureauSummaryView,
  ExecutionAttentionDetailView,
  ExecutionAttentionItemsView,
  ExecutionReviewIndexView,
  PolicyReviewDetailView,
  ReviewCandidatesView,
} from "./types.js";

export const API_ENDPOINTS = {
  executionReviewIndex: "/execution-review",
  executionReviewCandidates: "/execution-review/candidates",
  executionReviewBureaus: "/execution-review/bureaus",
  executionReviewItem: "/execution-review/items",
  executionAttentionItems: "/execution-review/attention-items",
  executionAttentionItem: "/execution-review/attention-items",
  executionAttentionBureaus: "/execution-review/attention-bureaus",
} as const;

export class ApiError extends Error {
  readonly status: number | null;
  readonly cause?: unknown;
  constructor(message: string, options: { status?: number | null; cause?: unknown } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status ?? null;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

export type FetchJsonOptions = { signal?: AbortSignal };

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { signal: options.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("ネットワークエラーでデータを取得できませんでした", { cause: error });
  }
  if (!response.ok) {
    const status = response.status;
    if (status === 404) throw new ApiError("データが見つかりませんでした", { status });
    throw new ApiError(`データの取得に失敗しました（HTTP ${status}）`, { status });
  }
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new ApiError("サーバー応答が正しいJSONではありませんでした", { cause: error });
  }
}

export function fetchExecutionReviewIndex(options: FetchJsonOptions = {}): Promise<ExecutionReviewIndexView> {
  return fetchJson(API_ENDPOINTS.executionReviewIndex, options);
}
export function fetchExecutionAttentionItems(options: FetchJsonOptions = {}): Promise<ExecutionAttentionItemsView> {
  return fetchJson(API_ENDPOINTS.executionAttentionItems, options);
}
export function fetchExecutionAttentionDetail(itemId: string, options: FetchJsonOptions = {}): Promise<ExecutionAttentionDetailView> {
  return fetchJson(`${API_ENDPOINTS.executionAttentionItem}/${encodeURIComponent(itemId)}`, options);
}
export function fetchAttentionBureauSummary(options: FetchJsonOptions = {}): Promise<AttentionBureauSummaryView> {
  return fetchJson(API_ENDPOINTS.executionAttentionBureaus, options);
}

/* Legacy clients retained during migration. */
export function fetchReviewCandidates(options: FetchJsonOptions = {}): Promise<ReviewCandidatesView> {
  return fetchJson(API_ENDPOINTS.executionReviewCandidates, options);
}
export function fetchBureauSummary(options: FetchJsonOptions = {}): Promise<BureauSummaryView> {
  return fetchJson(API_ENDPOINTS.executionReviewBureaus, options);
}
export function fetchPolicyReviewDetail(reviewId: string, options: FetchJsonOptions = {}): Promise<PolicyReviewDetailView> {
  return fetchJson(`${API_ENDPOINTS.executionReviewItem}/${encodeURIComponent(reviewId)}`, options);
}
