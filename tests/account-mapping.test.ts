import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateAccountMappingFile } from "../src/execution-review/account-mapping.ts";

describe("validateAccountMappingFile", () => {
  it("exampleファイルを受理する", async () => {
    const example = JSON.parse(
      await readFile(
        join(import.meta.dirname, "../data/manual/execution-review/account-mapping.example.json"),
        "utf8",
      ),
    );
    const result = validateAccountMappingFile(example);
    assert.deepEqual(result.errors, []);
    assert.equal(result.valid, true);
  });

  it("relationTypeが全種類をカバーできる（one-to-many / many-to-one含む）", async () => {
    const example = JSON.parse(
      await readFile(
        join(import.meta.dirname, "../data/manual/execution-review/account-mapping.example.json"),
        "utf8",
      ),
    );
    const types = new Set(example.mappings.map((m: { relationType: string }) => m.relationType));
    for (const expected of ["exact", "renamed", "merged", "discontinued"]) {
      assert.ok(types.has(expected), `exampleに${expected}が必要`);
    }
    // merged = many-to-one
    const merged = example.mappings.find((m: { relationType: string }) => m.relationType === "merged");
    assert.ok(merged.fiscalYear2024.length >= 2, "mergedは2024側に複数キーを持てる");
    assert.equal(merged.fiscalYear2026.length, 1);
  });

  it("重複IDと不正なconfidenceを検出する", () => {
    const result = validateAccountMappingFile({
      version: 1,
      updatedAt: "2026-08-22T00:00:00.000Z",
      mappings: [
        {
          mappingId: "map-0001",
          fiscalYear2024: [{ account: "一般会計", chapter: "01:議会費" }],
          fiscalYear2026: [{ account: "一般会計", chapter: "01:議会費" }],
          granularity: "chapter",
          confidence: "S",
          relationType: "exact",
          evidence: { title: "t", url: "https://x", page: null },
        },
        {
          mappingId: "map-0001",
          fiscalYear2024: [],
          fiscalYear2026: [],
          granularity: "item",
          confidence: "unmatched",
          relationType: "unknown",
          evidence: { title: "t", url: "https://x", page: null },
        },
      ],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes("confidence")));
    assert.ok(result.errors.some((error) => error.includes("重複")));
  });
});
