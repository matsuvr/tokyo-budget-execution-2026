import { describe, it } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.ts";
import type { Env, R2ObjectBody } from "../src/types.ts";

const ITEM_ID = "一般会計:10:土木費:04:公園霊園費:01:整備費";
const LIST_KEY = "data/normalized/execution-review/execution-attention-items.json";
const DETAIL_KEY = "data/normalized/execution-review/execution-attention-details.json";
const BUREAU_KEY = "data/normalized/execution-review/attention-bureau-summary.json";
const OBJECTS = {
  [LIST_KEY]: JSON.stringify({ records: [{ itemId: ITEM_ID, comparison: null, reviewScope: "operational" }] }),
  [DETAIL_KEY]: JSON.stringify({ records: [{ item: { itemId: ITEM_ID }, breakdown: {}, paymentEvidence: {} }] }),
  [BUREAU_KEY]: JSON.stringify({ rows: [{ bureau: "土木費", scope: "operational" }] }),
};

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
          httpEtag: `"${key}"`,
          size: text.length,
          httpMetadata: { contentType: "application/json; charset=utf-8" },
        };
      },
    },
  };
  return { env, requestedKeys };
}

describe("execution attention API", () => {
  it("serves the full list from canonical and /api aliases", async () => {
    for (const path of ["/execution-review/attention-items", "/api/execution-review/attention-items"]) {
      const { env, requestedKeys } = fakeEnv(OBJECTS);
      const response = await worker.fetch(new Request(`https://api.test${path}`), env);
      assert.equal(response.status, 200);
      assert.deepEqual(requestedKeys, [LIST_KEY]);
      const body = (await response.json()) as { records: { comparison: null }[] };
      assert.equal(body.records[0].comparison, null);
    }
  });

  it("serves the attention bureau summary", async () => {
    for (const path of [
      "/execution-review/attention-bureaus",
      "/api/execution-review/attention-bureaus",
    ]) {
      const { env, requestedKeys } = fakeEnv(OBJECTS);
      const response = await worker.fetch(new Request(`https://api.test${path}`), env);
      assert.equal(response.status, 200);
      assert.deepEqual(requestedKeys, [BUREAU_KEY]);
    }
  });

  it("decodes Japanese and colon item ids for detail lookup", async () => {
    const { env } = fakeEnv(OBJECTS);
    const response = await worker.fetch(
      new Request(`https://api.test/execution-review/attention-items/${encodeURIComponent(ITEM_ID)}`),
      env,
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as { item: { itemId: string } };
    assert.equal(body.item.itemId, ITEM_ID);
  });

  it("returns 404 for missing details and 400 for invalid ids", async () => {
    const { env } = fakeEnv(OBJECTS);
    const missing = await worker.fetch(
      new Request(`https://api.test/execution-review/attention-items/${encodeURIComponent("missing")}`),
      env,
    );
    assert.equal(missing.status, 404);
    const invalid = await worker.fetch(
      new Request("https://api.test/execution-review/attention-items/%2Fbad"),
      env,
    );
    assert.equal(invalid.status, 400);
  });

  it("returns bodyless HEAD responses", async () => {
    const { env } = fakeEnv(OBJECTS);
    const response = await worker.fetch(
      new Request(`https://api.test/execution-review/attention-items/${encodeURIComponent(ITEM_ID)}`, { method: "HEAD" }),
      env,
    );
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "");
  });
});
