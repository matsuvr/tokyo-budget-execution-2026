import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildComparison,
  buildIndexes,
} from "../src/execution-review/mapping/build-comparisons.ts";

function settlementRecord(overrides: {
  kind?: string;
  chapter: string;
  section: string;
  item?: string;
  currentBudgetYen: number;
  spentYen: number;
  carryoverYen?: number;
  unusedYen?: number;
  initialBudgetYen?: number | null;
}) {
  return {
    kind: overrides.kind,
    accountKey: {
      chapter: overrides.chapter,
      section: overrides.section,
      item: overrides.item ?? "",
    },
    currentBudgetYen: overrides.currentBudgetYen,
    spentYen: overrides.spentYen,
    carryoverYen: overrides.carryoverYen ?? 0,
    unusedYen: overrides.unusedYen ?? 0,
    initialBudgetYen: overrides.initialBudgetYen ?? null,
    sourcePage: 100,
  };
}

describe("buildComparison", () => {
  const settlementRecords = [
    // 款行
    settlementRecord({
      chapter: "02:総務費",
      section: "",
      currentBudgetYen: 1_000_000,
      spentYen: 800_000,
      carryoverYen: 100_000,
      unusedYen: 100_000,
    }),
    // 項行
    settlementRecord({
      chapter: "02:総務費",
      section: "01:総務管理費",
      currentBudgetYen: 500_000,
      spentYen: 400_000,
      initialBudgetYen: 480_000,
    }),
    // 目行（項と同じ名称を持つため索引の分離を検証する）
    settlementRecord({
      chapter: "02:総務費",
      section: "01:総務管理費",
      item: "01:総務管理費",
      currentBudgetYen: 300_000,
      spentYen: 250_000,
    }),
  ];
  const overviewFy2024 = [
    { level: "kan", chapter: "02:総務費", section: null, initialBudgetYen: 900_000, sourcePage: 8 },
    {
      level: "kou",
      chapter: "02:総務費",
      section: "01:総務管理費",
      initialBudgetYen: 480_000,
      sourcePage: 6,
    },
  ];
  const overviewFy2026 = [
    { level: "kan", chapter: "02:総務費", section: null, initialBudgetYen: 950_000, sourcePage: null },
    {
      level: "kou",
      chapter: "02:総務費",
      section: "01:総務管理費",
      initialBudgetYen: 490_000,
      sourcePage: null,
    },
  ];

  it("款粒度の比較では子階層を二重計上しない", () => {
    const index = buildIndexes(settlementRecords, overviewFy2024, overviewFy2026);
    const record = buildComparison(
      "map-0001",
      {
        confidence: "A",
        relationType: "exact",
        granularity: "chapter",
        fy2024Keys: [{ account: "一般会計", chapter: "02:総務費" }],
        fy2026Keys: [{ account: "一般会計", chapter: "02:総務費" }],
      },
      index,
      1,
    );
    assert.ok(record);
    assert.equal(record.amounts.fy2024CurrentBudgetYen, 1_000_000); // 款行のみ
    assert.equal(record.amounts.fy2024InitialBudgetYen, 900_000);
    assert.equal(record.amounts.fy2026InitialBudgetYen, 950_000);
    assert.equal(record.rates.executionRate, 0.8);
    assert.ok(Math.abs((record.rates.budgetContinuationRate ?? 0) - 950_000 / 900_000) < 1e-12);
  });

  it("項粒度の比較は項行を使い、目行を混ぜない", () => {
    const index = buildIndexes(settlementRecords, overviewFy2024, overviewFy2026);
    const record = buildComparison(
      "map-0002",
      {
        confidence: "B",
        relationType: "renamed",
        granularity: "item",
        fy2024Keys: [{ account: "一般会計", chapter: "02:総務費", section: "01:総務管理費" }],
        fy2026Keys: [{ account: "一般会計", chapter: "02:総務費", section: "01:総務管理費" }],
      },
      index,
      2,
    );
    assert.ok(record);
    assert.equal(record.amounts.fy2024CurrentBudgetYen, 500_000);
    assert.equal(record.amounts.fy2024InitialBudgetYen, 480_000);
    assert.equal(record.amounts.fy2026InitialBudgetYen, 490_000);
  });

  it("merged対応は複数キーの単純合計を行う（按分なし）", () => {
    const index = buildIndexes(settlementRecords, overviewFy2024, overviewFy2026);
    const record = buildComparison(
      "map-0003",
      {
        confidence: "B",
        relationType: "merged",
        granularity: "chapter",
        fy2024Keys: [
          { account: "一般会計", chapter: "02:総務費" },
          { account: "一般会計", chapter: "03:徴税費" },
        ],
        fy2026Keys: [{ account: "一般会計", chapter: "02:総務費" }],
      },
      index,
      3,
    );
    // 徴税費の明細が無いため比較対象は総務費のみ（欠損側のキーは無視して合算しない）
    assert.ok(record);
    assert.equal(record.amounts.fy2024CurrentBudgetYen, 1_000_000);
  });

  it("対応する明細がない場合はnullを返す", () => {
    const index = buildIndexes([], [], []);
    const record = buildComparison(
      "map-0004",
      {
        confidence: "A",
        relationType: "exact",
        granularity: "chapter",
        fy2024Keys: [{ account: "一般会計", chapter: "99:存在しない" }],
        fy2026Keys: [{ account: "一般会計", chapter: "99:存在しない" }],
      },
      index,
      4,
    );
    assert.equal(record, null);
  });
});
