import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseAmountYen } from "../src/execution-review/settlement/parse-amount.ts";

describe("parseAmountYen", () => {
  it("桁区切りカンマを円整数へ変換する", () => {
    assert.equal(parseAmountYen("1,234"), 1234);
    assert.equal(parseAmountYen("368,474,000,000"), 368_474_000_000);
  });

  it("明示的な0と欠損を混同しない", () => {
    assert.equal(parseAmountYen("0"), 0);
    assert.equal(parseAmountYen(""), null);
    assert.equal(parseAmountYen("   "), null);
    assert.equal(parseAmountYen(null), null);
    assert.equal(parseAmountYen(undefined), null);
  });

  it("ダッシュ系のゼロ表現を0へ正規化する", () => {
    assert.equal(parseAmountYen("―"), 0);
    assert.equal(parseAmountYen("－"), 0);
    assert.equal(parseAmountYen("-"), 0);
    assert.equal(parseAmountYen("ー"), 0);
    assert.equal(parseAmountYen("─"), 0);
  });

  it("半角・全角空白を無視する", () => {
    assert.equal(parseAmountYen(" 1,234 "), 1234);
    assert.equal(parseAmountYen("1,234"), 1234);
    assert.equal(parseAmountYen("\t1,234\n"), 1234);
  });

  it("括弧付き注記を除去して数値化する", () => {
    assert.equal(parseAmountYen("1,234（注2）"), 1234);
    assert.equal(parseAmountYen("1,234(注)"), 1234);
    assert.equal(parseAmountYen("（注）"), null);
  });

  it("△付きは負数として解釈する（接頭・後置どちらも）", () => {
    assert.equal(parseAmountYen("△992,309,000"), -992_309_000);
    assert.equal(parseAmountYen("62,437,836,000 △"), -62_437_836_000);
  });

  it("全角数字を解釈する", () => {
    assert.equal(parseAmountYen("１,２３４"), 1234);
  });

  it("単位が千円の場合は円へ換算する", () => {
    assert.equal(parseAmountYen("1,234", { unit: "thousand-yen" }), 1_234_000);
    assert.equal(parseAmountYen("△5", { unit: "thousand-yen" }), -5_000);
    assert.equal(parseAmountYen("0", { unit: "thousand-yen" }), 0);
  });

  it("不正な英字混入を黙って0にしない", () => {
    assert.throws(() => parseAmountYen("1,2a4"), SyntaxError);
    assert.throws(() => parseAmountYen("abc"), SyntaxError);
    assert.throws(() => parseAmountYen("12,34"), SyntaxError);
  });

  it("安全整数の範囲を検証する", () => {
    const maxSafe = Number.MAX_SAFE_INTEGER.toString();
    assert.equal(parseAmountYen(maxSafe), Number.MAX_SAFE_INTEGER);
    assert.throws(() => parseAmountYen("9,223,372,036,854,775,808"), RangeError);
    // 千円換算で範囲超過となるケース
    assert.throws(
      () => parseAmountYen(maxSafe, { unit: "thousand-yen" }),
      RangeError,
    );
  });
});
