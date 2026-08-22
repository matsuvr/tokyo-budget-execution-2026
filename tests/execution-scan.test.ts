import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RATE_RANKING_MIN_BUDGET_YEN,
  buildScanRecord,
  rankScanRecords,
} from "../src/execution-review/settlement/execution-scan.ts";
import type { ExecutionRecord } from "../src/execution-review/types.ts";

function record(overrides: {
  key: string;
  chapter?: string;
  section?: string;
  item?: string;
  currentBudgetYen?: number;
  spentYen?: number;
  carryoverYen?: number;
  unusedYen?: number;
}): ExecutionRecord {
  return {
    fiscalYear: 2024,
    bureau: "",
    accountKey: {
      account: "一般会計",
      chapter: overrides.chapter ?? "02:総務費",
      section: overrides.section ?? "",
      item: overrides.item ?? "",
      key: overrides.key,
    },
    initialBudgetYen: null,
    currentBudgetYen: overrides.currentBudgetYen ?? 1_000_000_000,
    spentYen: overrides.spentYen ?? 500_000_000,
    carryoverYen: overrides.carryoverYen ?? 0,
    unusedYen: overrides.unusedYen ?? 0,
    sourcePage: 100,
    source: { title: "t", url: "https://metro.tokyo.lg.jp/x", page: 100, summary: "" },
    executionMethod: "unknown",
  };
}

describe("buildScanRecord", () => {
  it("執行率・繰越率・不用率を付与する", () => {
    const scan = buildScanRecord(
      record({
        key: "k",
        currentBudgetYen: 1_000,
        spentYen: 800,
        carryoverYen: 100,
        unusedYen: 100,
      }),
    );
    assert.equal(scan.rates.executionRate, 0.8);
    assert.equal(scan.rates.carryoverRate, 0.1);
    assert.equal(scan.rates.unusedRate, 0.1);
    assert.equal(scan.policyReview.excluded, false);
  });

  it("分母0の行は率がnullになる（0で補完しない）", () => {
    const scan = buildScanRecord(record({ key: "k", currentBudgetYen: 0 }));
    assert.equal(scan.rates.executionRate, null);
    assert.equal(scan.rates.carryoverRate, null);
    assert.equal(scan.rates.unusedRate, null);
  });

  it("公債費・予備費などの対象外行に理由コードを付ける", () => {
    const publicDebt = buildScanRecord(
      record({ key: "k1", chapter: "16:公債費" }),
    );
    assert.equal(publicDebt.policyReview.excluded, true);
    assert.equal(publicDebt.policyReview.reasonCode, "public-debt");

    const reserve = buildScanRecord(record({ key: "k2", chapter: "18:予備費" }));
    assert.equal(reserve.policyReview.excluded, true);
    assert.equal(reserve.policyReview.reasonCode, "reserve-fund");
  });
});

describe("rankScanRecords", () => {
  const base = { currentBudgetYen: RATE_RANKING_MIN_BUDGET_YEN * 10 };
  const records = [
    buildScanRecord(record({ ...base, key: "a", item: "01:a", unusedYen: 300 })),
    buildScanRecord(record({ ...base, key: "b", item: "01:b", unusedYen: 500 })),
    // 同値は安定キー昇順
    buildScanRecord(record({ ...base, key: "c", item: "01:c", unusedYen: 300 })),
    // 対象外行は除外
    buildScanRecord(record({ ...base, key: "d", chapter: "16:公債費", item: "01:d", unusedYen: 900 })),
  ];

  it("降順・固定タイブレークで決定的に並ぶ", () => {
    const ranking = rankScanRecords(records, { field: "unusedAmount" });
    assert.deepEqual(
      ranking.map((entry) => entry.key),
      ["b", "a", "c"],
    );
  });

  it("率ランキングは予算現額下限と計算不能行を扱う", () => {
    const small = buildScanRecord(
      record({ ...base, key: "s", item: "01:s", currentBudgetYen: 50_000_000, unusedYen: 49_000_000 }),
    ); // 不用率高いが下限未満
    const zeroBudget = buildScanRecord(
      record({ ...base, key: "z", item: "01:z", currentBudgetYen: 0, unusedYen: 0 }),
    ); // 率null
    const ranking = rankScanRecords([...records, small, zeroBudget], {
      field: "unusedRate",
      minBudgetYen: RATE_RANKING_MIN_BUDGET_YEN,
    });
    assert.ok(!ranking.some((entry) => entry.key === "s"), "下限未満は除外");
    assert.ok(!ranking.some((entry) => entry.key === "z"), "率nullは除外");
  });

  it("limitを守る", () => {
    const many = Array.from({ length: 15 }, (_, index) =>
      buildScanRecord(record({ ...base, key: `x${index}`, item: `01:x${index}`, unusedYen: index + 1 })),
    );
    assert.equal(rankScanRecords(many, { field: "unusedAmount" }).length, 10);
  });
});
