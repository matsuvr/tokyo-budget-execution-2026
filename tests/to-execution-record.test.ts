import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTrailingNegativeSigns,
  toExecutionRecord,
  AMOUNT_COLUMN_ORDER,
  type IntermediateRow,
} from "../src/execution-review/settlement/to-execution-record.ts";

function intermediateRow(overrides: Partial<IntermediateRow>): IntermediateRow {
  return {
    pageNumber: 120,
    rowIndex: 0,
    parseStatus: "ok",
    warnings: [],
    kind: "moku",
    stableKey: "02:総務費/01:総務管理費/01:総務管理費",
    hierarchy: {
      kan: { code: "02", displayName: "総務費", normalizedName: "総務費" },
      kou: { code: "01", displayName: "総務管理費", normalizedName: "総務管理費" },
      moku: { code: "01", displayName: "総務管理費", normalizedName: "総務管理費" },
    },
    cells: {},
    ...overrides,
  };
}

describe("normalizeTrailingNegativeSigns", () => {
  it("後置△を次の金額セルの接頭辞へ移動する", () => {
    const normalized = normalizeTrailingNegativeSigns(
      {
        initialBudget: "5,419,000,000 △",
        supplementaryBudget: "104,528,000",
        currentBudgetTotal: "5,314,472,000",
      },
      AMOUNT_COLUMN_ORDER,
    );
    assert.equal(normalized.initialBudget, "5,419,000,000");
    assert.equal(normalized.supplementaryBudget, "△104,528,000");
    assert.equal(normalized.currentBudgetTotal, "5,314,472,000");
  });

  it("次のセルが空なら移動しない", () => {
    const normalized = normalizeTrailingNegativeSigns(
      { initialBudget: "1,000 △" },
      AMOUNT_COLUMN_ORDER,
    );
    assert.equal(normalized.initialBudget, "1,000 △");
  });
});

describe("toExecutionRecord", () => {
  it("目行を型付き執行実績へ変換する", () => {
    const result = toExecutionRecord(
      intermediateRow({
        cells: {
          initialBudget: "368,474,000,000",
          currentBudgetTotal: "608,605,218,000",
          spentAmount: "525,048,004,615",
          carryoverContinuingFee: "0",
          carryoverAuthorized: "26,091,089,000",
          carryoverSuccessive: "13,935,000",
          unusedAmount: "57,452,189,385",
        },
      }),
    );
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.rowKind, "hierarchy");
    assert.equal(result.record.fiscalYear, 2024);
    assert.equal(result.record.initialBudgetYen, 368_474_000_000);
    assert.equal(result.record.currentBudgetYen, 608_605_218_000);
    assert.equal(result.record.spentYen, 525_048_004_615);
    // 繰越は継続費＋繰越明許費＋逓次繰越の合計
    assert.equal(result.record.carryoverYen, 26_091_089_000 + 13_935_000);
    assert.equal(result.record.unusedYen, 57_452_189_385);
    assert.equal(result.record.accountKey.account, "一般会計");
    assert.match(result.record.accountKey.key, /^一般会計:02:総務費:01:総務管理費:01:/);
    assert.equal(result.record.sourcePage, 120);
    assert.ok(result.record.source.url.includes("metro.tokyo.lg.jp"));
    assert.equal(result.record.executionMethod, "unknown");
  });

  it("後置△を次列の負数として解釈する（議会費の補正減額）", () => {
    const result = toExecutionRecord(
      intermediateRow({
        pageNumber: 116,
        kind: "kan",
        stableKey: null,
        hierarchy: {
          kan: { code: "01", displayName: "議会費", normalizedName: "議会費" },
          kou: null,
          moku: null,
        },
        cells: {
          initialBudget: "5,419,000,000 △",
          supplementaryBudget: "104,528,000",
          priorYearCarryover: "0",
          continuingReserveAdjustment: "0",
          currentBudgetTotal: "5,314,472,000",
          spentAmount: "4,802,993,869",
          unusedAmount: "511,478,131",
        },
      }),
    );
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    // 当初予算は正の値として解釈され、△は補正額の負号として機能する
    assert.equal(result.record.initialBudgetYen, 5_419_000_000);
    assert.equal(result.record.currentBudgetYen, 5_314_472_000);
    assert.equal(result.record.accountKey.item, "");
  });

  it("節別明細行はskip、小計行はrowKind=subtotalになる", () => {
    const skipped = toExecutionRecord(
      intermediateRow({ kind: "data", cells: { sectionSpentAmount: "635,285,000" } }),
    );
    assert.equal(skipped.status, "skip");

    const subtotal = toExecutionRecord(
      intermediateRow({
        kind: "subtotal",
        hierarchy: {
          kan: { code: "02", displayName: "総務費", normalizedName: "総務費" },
          kou: { code: "01", displayName: "総務管理費", normalizedName: "総務管理費" },
          moku: null,
        },
        cells: {
          spentAmount: "56,182,202,564",
          carryoverAuthorized: "26,091,089,000",
          unusedAmount: "1,212,514,904",
        },
      }),
    );
    assert.equal(subtotal.status, "ok");
    if (subtotal.status !== "ok") return;
    assert.equal(subtotal.rowKind, "subtotal");
    // 現額が印字されていないため恒等式から算術復元される
    assert.equal(subtotal.record.derived?.includes("currentBudgetYen"), true);
    assert.equal(
      subtotal.record.currentBudgetYen,
      56_182_202_564 + 26_091_089_000 + 1_212_514_904,
    );
  });

  it("解析不能な金額を0へ変換せずエラーにする", () => {
    const result = toExecutionRecord(
      intermediateRow({
        cells: {
          currentBudgetTotal: "0238,885,000,000",
          spentAmount: "100,000",
          unusedAmount: "0",
        },
      }),
    );
    assert.equal(result.status, "error");
    if (result.status !== "error") return;
    assert.match(result.reason, /unparseable/);
  });

  it("他に金額のない行の空欄は0へ補完しない", () => {
    const result = toExecutionRecord(intermediateRow({ cells: { remarks: "備考のみ" } }));
    assert.equal(result.status, "error");
    if (result.status !== "error") return;
    assert.match(result.reason, /missing/);
  });

  it("空欄=0の表慣習をconventionsで明示する", () => {
    const result = toExecutionRecord(
      intermediateRow({
        cells: {
          currentBudgetTotal: "3,400,000,000",
          initialBudget: "3,400,000,000",
          spentAmount: "3,400,000,000",
        },
      }),
    );
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.deepEqual(result.record.conventions, [
      "blank-as-zero:carryoverContinuingFee",
      "blank-as-zero:carryoverAuthorized",
      "blank-as-zero:carryoverSuccessive",
      "blank-as-zero:unusedAmount",
    ]);
    assert.equal(result.record.unusedYen, 0);
    assert.equal(result.record.carryoverYen, 0);
  });

  it("parseStatus=errorの中間行はエラーにする", () => {
    const result = toExecutionRecord(intermediateRow({ parseStatus: "error" }));
    assert.equal(result.status, "error");
  });
});
