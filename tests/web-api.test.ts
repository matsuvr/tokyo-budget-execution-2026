import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ApiError, fetchJson, fetchPolicyReviewDetail } from "../web/api.ts";

function stubFetch(
  implementation: (url: string) => Promise<Response>,
): void {
  (globalThis as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) =>
    implementation(String(input))) as typeof fetch;
}

describe("web/api fetchJson", () => {
  it("非200はApiErrorにstatusを載せて失敗する（空配列で正常扱いしない）", async () => {
    stubFetch(async () => new Response("{}", { status: 404 }));
    await assert.rejects(fetchJson("/x"), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 404);
      return true;
    });
  });

  it("JSON不正はcauseを分離したApiErrorになる", async () => {
    stubFetch(async () => new Response("not json", { status: 200 }));
    await assert.rejects(fetchJson("/x"), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, null);
      assert.ok(error.cause != null);
      return true;
    });
  });

  it("ネットワーク失敗はユーザー向け短文のApiErrorになる", async () => {
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    await assert.rejects(fetchJson("/x"), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, null);
      return true;
    });
  });

  it("reviewIdをencodeURIComponentでエンコードして詳細APIへ要求する", async () => {
    let requestedUrl = "";
    stubFetch(async (url) => {
      requestedUrl = url;
      return Response.json({ reviewId: "rev_1" });
    });
    const detail = await fetchPolicyReviewDetail("rev/1 id");
    assert.equal(requestedUrl, "/execution-review/items/rev%2F1%20id");
    assert.equal(detail.reviewId, "rev_1");
  });
});
