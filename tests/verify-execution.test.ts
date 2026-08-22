import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  verifyBudgetIdentity,
  verifyOfficialTotals,
  type OfficialTotalFixture,
} from "../src/execution-review/settlement/verify-execution.ts";
import type { ExecutionRecord } from "../src/execution-review/types.ts";

type RecordOverrides = Partial<ExecutionRecord> & { key?: string };

function record(overrides: RecordOverrides): ExecutionRecord {
  const { key, ...rest } = overrides as RecordOverrides;
  return {
    fiscalYear: 2024,
    bureau: "",
    accountKey: {
      account: "一般会計",
      chapter: key ?? "01:議会費",
      section: "",
      item: "",
      key: `一般会計:${key ?? "01:議会費"}::`,
    },
    initialBudgetYen: null,
    currentBudgetYen: 1000,
    spentYen: 600,
    carryoverYen: 300,
    unusedYen: 100,
    sourcePage: 1,
    source: { title: "t", url: "https://metro.tokyo.lg.jp/x", page: 1, summary: "" },
    executionMethod: "unknown",
    ...rest,
  };
}

describe("verifyBudgetIdentity", () => {
  it("恒等式が成立する行を検証する", () => {
    const result = verifyBudgetIdentity([record({})]);
    assert.equal(result.checked, 1);
    assert.equal(result.passed, 1);
    assert.equal(result.mismatched.length, 0);
  });

  it("不一致行は安定キー・ページ・差額付きで返る", () => {
    const result = verifyBudgetIdentity([
      record({ currentBudgetYen: 9999, sourcePage: 42 }),
    ]);
    assert.equal(result.passed, 0);
    assert.deepEqual(result.mismatched, [
      { key: "一般会計:01:議会費::", pageNumber: 42, differenceYen: 8999 },
    ]);
  });

  it("現額を復元した行と欠損行は別件数として数える", () => {
    const derived = record({
      currentBudgetYen: 900,
    });
    (derived as ExecutionRecord & { derived?: string[] }).derived = ["currentBudgetYen"];
    const withNull = record({ carryoverYen: null as unknown as number });
    const result = verifyBudgetIdentity([derived, withNull, record({})]);
    assert.equal(result.derivedSkipped, 1);
    assert.equal(result.notVerifiable, 1);
    assert.equal(result.checked, 1);
  });

  it("許容差を明示的に設定できる", () => {
    const result = verifyBudgetIdentity([record({ currentBudgetYen: 1001 })], {
      toleranceYen: 1,
    });
    assert.equal(result.passed, 1);
  });
});

describe("verifyOfficialTotals", () => {
  const fixtures: OfficialTotalFixture[] = [
    {
      name: "歳出予算現額",
      officialYen: 1500,
      field: "currentBudgetYen",
      level: "chapter",
      toleranceYen: 0,
      sourceTitle: "決算の総括",
      sourcePage: 9,
    },
  ];

  it("款行のみを合計して公式総額と照合する", () => {
    const records = [
      record({}), // 款
      record({ key: "02:総務費" }), // 款（別キー）
      record({ accountKey: { ...record({}).accountKey, section: "01:x" } }), // 項 → 対象外
    ];
    // 2款合計 = 2000、公式1500との差500
    const result = verifyOfficialTotals(records, fixtures);
    assert.equal(result[0].actualSumYen, 2000);
    assert.equal(result[0].differenceYen, 500);
    assert.equal(result[0].pass, false);
  });

  it("許容差内なら合格", () => {
    const result = verifyOfficialTotals(
      [record({ currentBudgetYen: 1_500_999 })],
      [{ ...fixtures[0], officialYen: 1_500_000, toleranceYen: 1000 }],
    );
    assert.equal(result[0].differenceYen, 999);
    assert.equal(result[0].pass, true);
    const overTolerance = verifyOfficialTotals(
      [record({ currentBudgetYen: 1_501_001 })],
      [{ ...fixtures[0], officialYen: 1_500_000, toleranceYen: 1000 }],
    );
    assert.equal(overTolerance[0].pass, false);
  });
});
