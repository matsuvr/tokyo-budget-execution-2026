import type {
  BureauSummaryView,
  ExecutionReviewIndexView,
  PolicyReviewDetailView,
  ReviewCandidatesView,
} from "./types.ts";

/**
 * 執行レビューAPIクライアント（Issue #47）。
 * DOMに依存しない通信モジュール。失敗時に空配列やダミー値を返さず、
 * ApiErrorとして呼び出し元に伝える。
 */

export const API_ENDPOINTS = {
  executionReviewIndex: "/execution-review",
  executionReviewCandidates: "/execution-review/candidates",
  executionReviewBureaus: "/execution-review/bureaus",
  executionReviewItem: "/execution-review/items",
} as const;

/** ユーザー向け短文(message)とdebug用causeを分離したエラー */
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

export type FetchJsonOptions = {
  signal?: AbortSignal;
};

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
    if (status === 404) {
      throw new ApiError("データが見つかりませんでした", { status });
    }
    throw new ApiError(`データの取得に失敗しました（HTTP ${status}）`, { status });
  }
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new ApiError("サーバー応答が正しいJSONではありませんでした", { cause: error });
  }
}

export async function fetchExecutionReviewIndex(
  options: FetchJsonOptions = {},
): Promise<ExecutionReviewIndexView> {
  return fetchJson<ExecutionReviewIndexView>(API_ENDPOINTS.executionReviewIndex, options);
}

export async function fetchReviewCandidates(
  options: FetchJsonOptions = {},
): Promise<ReviewCandidatesView> {
  return fetchJson<ReviewCandidatesView>(API_ENDPOINTS.executionReviewCandidates, options);
}

export async function fetchBureauSummary(options: FetchJsonOptions = {}): Promise<BureauSummaryView> {
  return fetchJson<BureauSummaryView>(API_ENDPOINTS.executionReviewBureaus, options);
}

export async function fetchPolicyReviewDetail(
  reviewId: string,
  options: FetchJsonOptions = {},
): Promise<PolicyReviewDetailView> {
  // reviewIdはURLパスへ埋め込むため必ずエンコードする
  const encoded = encodeURIComponent(reviewId);
  return fetchJson<PolicyReviewDetailView>(
    `${API_ENDPOINTS.executionReviewItem}/${encoded}`,
    options,
  );
}
