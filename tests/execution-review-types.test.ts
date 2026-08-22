import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
  ExecutionAccountKey,
  ExecutionRecord,
  BudgetComparisonRecord,
  EvidenceReference,
} from "../src/execution-review/types.ts";

describe("execution-review types minimal fixture", () => {
  it("creates a valid ExecutionAccountKey", () => {
    const key: ExecutionAccountKey = {
      account: "一般会計",
      chapter: "総務費",
      section: "総務管理費",
      item: "一般管理費",
      key: "一般会計:総務費:総務管理費:一般管理費",
    };
    assert.equal(key.account, "一般会計");
  });

  it("creates ExecutionRecord with yen integers and null handling", () => {
    const source: EvidenceReference = {
      title: "令和6年度一般会計歳入歳出決算事項別明細書",
      url: "https://www.kaikeikanri.metro.tokyo.lg.jp/information/update/r7/09/24/3",
      page: 123,
      summary: "2024年度一般会計の支出済額等の集計ページ",
    };
    const record: ExecutionRecord = {
      fiscalYear: 2024,
      bureau: "総務局",
      accountKey: {
        account: "一般会計",
        chapter: "総務費",
        section: "総務管理費",
        item: "一般管理費",
        key: "一般会計:総務費:総務管理費:一般管理費",
      },
      initialBudgetYen: 150_000_000,
      currentBudgetYen: 200_000_000,
      spentYen: 120_000_000,
      carryoverYen: 10_000_000,
      unusedYen: 70_000_000,
      sourcePage: 123,
      source,
      executionMethod: "direct",
    };
    // Missing initial budget should be null, not 0
    const withNull: ExecutionRecord = { ...record, initialBudgetYen: null };
    assert.equal(withNull.initialBudgetYen, null);
    assert.equal(record.currentBudgetYen, 200_000_000);
  });

  it("creates BudgetComparisonRecord with confidence and rates", () => {
    const evidence: EvidenceReference = {
      title: "令和8年度東京都予算案の概要",
      url: "https://www.metro.tokyo.lg.jp/information/press/2026/01/2026013039",
      page: 10,
      summary: "2026年度当初予算の概要",
    };
    const exec: ExecutionRecord = {
      fiscalYear: 2024,
      bureau: "福祉局",
      accountKey: {
        account: "一般会計",
        chapter: "福祉費",
        section: "高齢福祉費",
        item: "高齢者支援費",
        key: "一般会計:福祉費:高齢福祉費:高齢者支援費",
      },
      initialBudgetYen: null,
      currentBudgetYen: 300_000_000,
      spentYen: 150_000_000,
      carryoverYen: 0,
      unusedYen: 150_000_000,
      sourcePage: 45,
      source: evidence,
      executionMethod: "subsidy",
    };
    const comparison: BudgetComparisonRecord = {
      comparisonId: "general:福祉費:高齢福祉費:高齢者支援費",
      accountKey2024: exec.accountKey,
      accountKey2026: exec.accountKey,
      comparisonUnit: "item",
      budget2024InitialYen: 300_000_000,
      budget2025InitialYen: 310_000_000,
      budget2026InitialYen: 295_000_000,
      mappingConfidence: "A",
      execution2024: exec,
      executionRate: 0.5,
      carryoverRate: 0,
      unusedRate: 0.5,
      budgetContinuationRate: 0.983,
      reviewStatus: "needs-explanation",
      reason: "不用率50%かつ予算継続率98%",
    };
    assert.equal(comparison.mappingConfidence, "A");
    assert.equal(comparison.reviewStatus, "needs-explanation");
    // unmatched should allow null keys
    const unmatched: BudgetComparisonRecord = {
      ...comparison,
      accountKey2026: null,
      comparisonUnit: "unmatched",
      mappingConfidence: "unmatched",
      execution2024: null,
      executionRate: null,
      budgetContinuationRate: null,
      reviewStatus: "incomparable",
      reason: "対応不能",
    };
    assert.equal(unmatched.mappingConfidence, "unmatched");
    assert.equal(unmatched.executionRate, null);
  });
});
