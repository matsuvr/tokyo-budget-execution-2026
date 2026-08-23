import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  attentionFlagLabel,
  confirmationLabel,
  gapCompositionLabel,
  scopeLabel,
} from "../web/labels.ts";

describe("new execution-gap labels", () => {
  it("does not expose internal enum values", () => {
    assert.equal(scopeLabel("operational"), "行政サービス・事業");
    assert.equal(gapCompositionLabel("carryover-dominant"), "繰越中心");
    assert.equal(attentionFlagLabel("budget-expanded"), "2026年度予算が増額");
    assert.equal(confirmationLabel("not-reviewed"), "公式資料の個別確認は未実施");
  });
});
