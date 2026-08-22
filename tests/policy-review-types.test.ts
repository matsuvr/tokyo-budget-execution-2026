import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validatePolicyReviewFile } from "../src/execution-review/policy-review-types.ts";

const FIXTURE_PATH = "tests/fixtures/execution-review/policy-review-example.json";

describe("validatePolicyReviewFile", () => {
  it("example fixtureが型検証を通る", async () => {
    const example = JSON.parse(await readFile(join(import.meta.dirname, "../", FIXTURE_PATH), "utf8"));
    const result = validatePolicyReviewFile(example);
    assert.deepEqual(result.errors, []);
    assert.equal(result.valid, true);
  });

  it("unknownタグとnot-found状態を区別できる", async () => {
    const example = JSON.parse(await readFile(join(import.meta.dirname, "../", FIXTURE_PATH), "utf8"));
    const confirmedWithUnknown = example.records[0];
    assert.equal(confirmedWithUnknown.reasonStatus, "confirmed");
    assert.ok(confirmedWithUnknown.reasonTags.length > 0);
    const notFound = example.records[1];
    assert.equal(notFound.improvementStatus, "not-found");
    assert.deepEqual(notFound.reasonTags.filter((t: string) => t === "unknown"), []);
  });

  it("staffing-or-delivery-capacityには根拠資料が必須", () => {
    const result = validatePolicyReviewFile({
      version: 1,
      records: [
        {
          reviewId: "rev-0099",
          comparisonId: "cmp-0099",
          policyTitle: "例",
          bureau: null,
          executionMethod: "direct",
          officialDescription: "",
          reasonStatus: "confirmed",
          reasonTags: ["staffing-or-delivery-capacity"],
          improvementStatus: "not-found",
          improvementSummary: "",
          evidenceReferences: [],
          reviewerNotes: "根拠なしで人員不足タグを付けた例（不合格になるべき）",
        },
      ],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes("staffing-or-delivery-capacity")));
  });

  it("confirmed以外でのreasonTags使用を検出する", () => {
    const result = validatePolicyReviewFile({
      version: 1,
      records: [
        {
          reviewId: "rev-0100",
          comparisonId: "cmp-0100",
          policyTitle: "例",
          bureau: null,
          executionMethod: "unknown",
          officialDescription: "",
          reasonStatus: "not-found",
          reasonTags: ["low-demand"],
          improvementStatus: "not-found",
          improvementSummary: "",
          evidenceReferences: [],
          reviewerNotes: "not-foundなのにタグを付けた例（不合格になるべき）",
        },
      ],
    });
    assert.equal(result.valid, false);
  });
});
