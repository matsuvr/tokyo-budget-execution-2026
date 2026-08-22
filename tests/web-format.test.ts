import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatRate, formatYen, sumAmountsByStatus } from "../web/format.ts";

describe("formatYen", () => {
  it("円データを兆円・億円・万円・円へ整形する", () => {
    assert.equal(formatYen(1_649_397_626_800), "1.65兆円");
    assert.equal(formatYen(5_766_700_000), "57.7億円");
    assert.equal(formatYen(129_304_399), "1.3億円");
    assert.equal(formatYen(1_293_043), "129万円");
    assert.equal(formatYen(999), "999円");
    assert.equal(formatYen(-20_000_000), "△2,000万円");
  });

  it("兆円・億円・万円の境界で正しく区分される", () => {
    assert.equal(formatYen(99_990_000), "9,999万円");
    assert.equal(formatYen(100_000_000), "1億円");
    assert.equal(formatYen(999_900_000_000), "9,999億円");
    assert.equal(formatYen(1_000_000_000_000), "1兆円");
  });

  it("0円は確認不能とせず、nullや非有限値とは区別する", () => {
    assert.equal(formatYen(0), "0円");
    assert.notEqual(formatYen(null), formatYen(0));
  });

  it("負数は△付きで明示し、非有限値は確認不能を返す", () => {
    assert.equal(formatYen(-1_000_000_000), "△10億円");
    assert.equal(formatYen(Number.NaN), "確認不能");
    assert.equal(formatYen(Number.POSITIVE_INFINITY), "確認不能");
    assert.equal(formatYen(Number.NEGATIVE_INFINITY), "確認不能");
  });

  it("欠損は0とみなさず確認不能を返す", () => {
    assert.equal(formatYen(null), "確認不能");
    assert.equal(formatYen(undefined), "確認不能");
    assert.equal(formatYen(Number.NaN), "確認不能");
  });
});

describe("formatRate", () => {
  it("小数率をパーセント表記へ整形する", () => {
    assert.equal(formatRate(0.5938893942809579), "59.4%");
    assert.equal(formatRate(0), "0.0%");
  });

  it("表示丸めは小数第2位を四捨五入した百分率（19.95%→20.0%）", () => {
    assert.equal(formatRate(0.1995), "20.0%");
    assert.equal(formatRate(0.19949), "19.9%");
    assert.equal(formatRate(1), "100.0%");
  });

  it("欠損は0%に変換せず確認不能を返す", () => {
    assert.equal(formatRate(null), "確認不能");
    assert.notEqual(formatRate(null), formatRate(0));
    assert.equal(formatRate(Number.NaN), "確認不能");
  });
});

describe("sumAmountsByStatus", () => {
  const records = [
    { status: "needs-explanation", amounts: { fy2024UnusedYen: 100, fy2026InitialBudgetYen: 200 } },
    { status: "needs-explanation", amounts: { fy2024UnusedYen: 50, fy2026InitialBudgetYen: 90 } },
    { status: "executed", amounts: { fy2024UnusedYen: 999, fy2026InitialBudgetYen: 999 } },
    { status: "needs-explanation", amounts: { fy2024UnusedYen: null, fy2026InitialBudgetYen: 10 } },
  ];

  it("指定statusのみを合計し、欠損行は除外して件数を返す", () => {
    const result = sumAmountsByStatus(records, "needs-explanation");
    assert.equal(result.unusedYenTotal, 150);
    assert.equal(result.fy2026InitialTotal, 300);
    assert.equal(result.matchedCount, 3);
    assert.equal(result.nullAmountCount, 1);
  });
});
