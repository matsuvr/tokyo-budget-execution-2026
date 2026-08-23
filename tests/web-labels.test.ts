import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  attentionFlagLabel,
  confirmationLabel,
  gapCompositionLabel,
  methodLabel,
  scopeLabel,
} from "../web/labels.ts";

describe("execution-gap labels", () => {
  it("keeps policy-facing labels concise", () => {
    assert.equal(scopeLabel("operational"), "行政サービス・事業");
    assert.equal(gapCompositionLabel("carryover-dominant"), "翌年度継続分が中心");
    assert.equal(attentionFlagLabel("budget-expanded"), "2026年度予算が増額");
  });

  it("collapses internal unknown states to a neutral dash", () => {
    assert.equal(confirmationLabel("not-reviewed"), "—");
    assert.equal(methodLabel("unknown"), "—");
    assert.equal(gapCompositionLabel("unavailable"), "—");
  });
});
