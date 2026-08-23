import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyReviewScope } from "../src/execution-review/review-scope.ts";
import type { ExecutionAccountKey } from "../src/execution-review/types.ts";

const base: ExecutionAccountKey = {
  account: "一般会計",
  chapter: "10:土木費",
  section: "04:公園霊園費",
  item: "01:整備費",
  key: "一般会計:10:土木費:04:公園霊園費:01:整備費",
};

describe("classifyReviewScope", () => {
  it("keeps ordinary unknown-method rows operational", () => {
    assert.equal(classifyReviewScope({ accountKey: base, executionMethod: "unknown" }).scope, "operational");
  });

  it("moves statutory/accounting rows to reference-only", () => {
    const publicDebt = { ...base, chapter: "16:公債費", key: "一般会計:16:公債費:::" };
    assert.equal(
      classifyReviewScope({ accountKey: publicDebt, executionMethod: "unknown" }).reasonCode,
      "public-debt",
    );
    const retirement = { ...base, item: "01:退職手当", key: "一般会計:x:x:01:退職手当" };
    assert.equal(
      classifyReviewScope({ accountKey: retirement, executionMethod: "unknown" }).reasonCode,
      "retirement-benefit-adjustment",
    );
  });

  it("classifies actual FY2024 retirement and pension account names as reference-only", () => {
    for (const item of ["01:恩給費", "02:退職費"]) {
      const actual: ExecutionAccountKey = {
        account: "一般会計",
        chapter: "02:総務費",
        section: "14:退職手当及年金費",
        item,
        key: `一般会計:02:総務費:14:退職手当及年金費:${item}`,
      };
      const result = classifyReviewScope({ accountKey: actual, executionMethod: "unknown" });
      assert.equal(result.scope, "reference-only");
      assert.equal(result.reasonCode, "retirement-benefit-adjustment");
      assert.equal(result.matchedKeyword, "退職手当及年金費");
    }
  });

  it("does not classify ordinary personnel costs as retirement adjustments", () => {
    const personnel = { ...base, item: "01:職員費", key: "一般会計:x:x:01:職員費" };
    assert.equal(
      classifyReviewScope({ accountKey: personnel, executionMethod: "unknown" }).scope,
      "operational",
    );
  });
});
