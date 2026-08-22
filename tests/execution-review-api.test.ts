import { describe, it } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.ts";
import type { Env, R2ObjectBody } from "../src/types.ts";

const INDEX_JSON = JSON.stringify({ version: 1, comparableCount: 2 });
const CANDIDATES_JSON = JSON.stringify({ records: [] });
const BUREAUS_JSON = JSON.stringify({ bureaus: [] });
const DETAILS_JSON = JSON.stringify({
  records: [
    {
      reviewId: "rev-0001",
      comparisonId: "cmp-0024",
      policyTitle: "2:総務費 10:退職手当及年金費",
      bureau: null,
      executionMethod: "direct",
      analysis: {},
      review: null,
      paymentEvidence: null,
    },
  ],
});

function fakeEnv(objects: Record<string, string>): { env: Env; requestedKeys: string[] } {
  const requestedKeys: string[] = [];
  const env: Env = {
    DATA: {
      async get(key: string): Promise<R2ObjectBody | null> {
        requestedKeys.push(key);
        const text = objects[key];
        if (text == null) return null;
        return {
          body: new Response(text).body as ReadableStream,
          httpEtag: '"test-etag"',
          size: text.length,
          httpMetadata: {
            contentType: "application/json; charset=utf-8",
            cacheControl: "public, max-age=300, s-maxage=3600",
          },
        };
      },
    },
  };
  return { env, requestedKeys };
}

const OBJECTS = {
  "data/normalized/execution-review/index.json": INDEX_JSON,
  "data/normalized/execution-review/review-candidates.json": CANDIDATES_JSON,
  "data/normalized/execution-review/bureau-summary.json": BUREAUS_JSON,
  "data/normalized/execution-review/policy-review-details.json": DETAILS_JSON,
};

describe("execution review API routes", () => {
  it("GET /execution-review は正しいobject keyで200を返す", async () => {
    const { env, requestedKeys } = fakeEnv(OBJECTS);
    const res = await worker.fetch(new Request("https://api.test/execution-review"), env);
    assert.equal(res.status, 200);
    assert.deepEqual(requestedKeys, ["data/normalized/execution-review/index.json"]);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    assert.match(res.headers.get("cache-control") ?? "", /max-age/);
    const body = (await res.json()) as { comparableCount: number };
    assert.equal(body.comparableCount, 2);
  });

  it("GET /execution-review/candidates と /bureaus は200を返す", async () => {
    const { env, requestedKeys } = fakeEnv(OBJECTS);
    const candidates = await worker.fetch(
      new Request("https://api.test/execution-review/candidates"),
      env,
    );
    assert.equal(candidates.status, 200);
    const bureaus = await worker.fetch(
      new Request("https://api.test/execution-review/bureaus"),
      env,
    );
    assert.equal(bureaus.status, 200);
    assert.deepEqual(requestedKeys, [
      "data/normalized/execution-review/review-candidates.json",
      "data/normalized/execution-review/bureau-summary.json",
    ]);
  });

  it("GET /execution-review/items/:id は完全一致した1件を返す", async () => {
    const { env, requestedKeys } = fakeEnv(OBJECTS);
    const res = await worker.fetch(
      new Request("https://api.test/execution-review/items/rev-0001"),
      env,
    );
    assert.equal(res.status, 200);
    assert.deepEqual(requestedKeys, [
      "data/normalized/execution-review/policy-review-details.json",
    ]);
    const body = (await res.json()) as { reviewId: string; comparisonId: string };
    assert.equal(body.reviewId, "rev-0001");
    assert.equal(body.comparisonId, "cmp-0024");
  });

  it("存在しないreviewIdは404を返す", async () => {
    const { env } = fakeEnv(OBJECTS);
    const res = await worker.fetch(
      new Request("https://api.test/execution-review/items/rev-9999"),
      env,
    );
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "not_found");
  });

  it("不正なreviewIdは400を返す", async () => {
    const { env, requestedKeys } = fakeEnv(OBJECTS);
    const res = await worker.fetch(
      new Request("https://api.test/execution-review/items/rev%2F..bad"),
      env,
    );
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "invalid_review_id");
    assert.deepEqual(requestedKeys, []);
  });

  it("対象R2 object欠損は404 JSONを返す", async () => {
    const { env } = fakeEnv({});
    const res = await worker.fetch(new Request("https://api.test/execution-review"), env);
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: string; key: string };
    assert.equal(body.error, "not_found");
    assert.equal(body.key, "data/normalized/execution-review/index.json");
  });

  it("HEADはボディなしで同一headersを返す", async () => {
    const { env } = fakeEnv(OBJECTS);
    const res = await worker.fetch(
      new Request("https://api.test/execution-review", { method: "HEAD" }),
      env,
    );
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "");
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");

    const itemHead = await worker.fetch(
      new Request("https://api.test/execution-review/items/rev-0001", { method: "HEAD" }),
      env,
    );
    assert.equal(itemHead.status, 200);
    assert.equal(await itemHead.text(), "");
    assert.equal(itemHead.headers.get("content-type"), "application/json; charset=utf-8");
  });

  it("POSTは405を返す", async () => {
    const { env } = fakeEnv(OBJECTS);
    const res = await worker.fetch(
      new Request("https://api.test/execution-review", { method: "POST" }),
      env,
    );
    assert.equal(res.status, 405);
  });
});
