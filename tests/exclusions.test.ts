import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkExclusion,
  isExcludedByNames,
  EXCLUSION_RULES,
} from "../src/execution-review/exclusions.ts";
import type { ExecutionAccountKey } from "../src/execution-review/types.ts";

describe("checkExclusion", () => {
  it("除外語は一箇所の定数に集約", () => {
    assert.ok(EXCLUSION_RULES.length > 0);
    // 各ルールが keyword と reasonCode を持つ
    for (const rule of EXCLUSION_RULES) {
      assert.equal(typeof rule.keyword, "string");
      assert.ok(rule.keyword.length > 0);
      assert.ok(rule.reasonCode != null);
    }
  });

  it("公債費は完全一致で除外", () => {
    const key: ExecutionAccountKey = {
      account: "一般会計",
      chapter: "公債費",
      section: "公債費",
      item: "元金",
      key: "一般会計:公債費:公債費:元金",
    };
    const result = checkExclusion(key);
    assert.equal(result.excluded, true);
    assert.equal(result.reasonCode, "public-debt");
  });

  it("特別区交付金は除外", () => {
    const result = isExcludedByNames("一般会計", "特別区財政調整交付金", "特別区交付金", "交付金");
    // chapter が完全一致するので除外
    assert.equal(result.excluded, true);
    assert.equal(result.reasonCode, "special-ward-grant");
  });

  it("地方消費税清算は除外", () => {
    const result = checkExclusion({
      account: "一般会計",
      chapter: "諸支出金",
      section: "地方消費税清算金",
      item: "清算金",
    });
    assert.equal(result.excluded, true);
    assert.equal(result.reasonCode, "local-consumption-tax-settlement");
  });

  it("予備費は除外", () => {
    const result = isExcludedByNames("一般会計", "予備費", "予備費", "予備費");
    assert.equal(result.excluded, true);
    assert.equal(result.reasonCode, "reserve-fund");
  });

  it("繰出金・繰入金は除外", () => {
    const out = isExcludedByNames("一般会計", "諸支出金", "繰出金", "繰出金");
    assert.equal(out.excluded, true);
    assert.equal(out.reasonCode, "inter-account-transfer");

    const inn = isExcludedByNames("一般会計", "繰入金", "繰入金", "繰入金");
    assert.equal(inn.excluded, true);
  });

  it("償還・返還は除外", () => {
    const result = isExcludedByNames("一般会計", "諸支出金", "償還金", "償還金");
    assert.equal(result.excluded, true);
    assert.equal(result.reasonCode, "repayment-refund");
  });

  it("類似名だが除外すべきでないものは除外しない（過剰除外を避ける）", () => {
    // 部分一致では除外しない
    const notExcluded1 = isExcludedByNames("一般会計", "公債費管理事業", "事業費", "事業");
    assert.equal(notExcluded1.excluded, false);
    assert.equal(notExcluded1.reasonCode, null);

    const notExcluded2 = isExcludedByNames("一般会計", "予備費管理事業", "管理費", "管理");
    assert.equal(notExcluded2.excluded, false);

    const notExcluded3 = isExcludedByNames("一般会計", "総務費", "総務管理費", "一般管理費");
    assert.equal(notExcluded3.excluded, false);

    const notExcluded4 = isExcludedByNames("一般会計", "福祉費", "高齢福祉費", "高齢者支援費");
    assert.equal(notExcluded4.excluded, false);

    // 空白や別表記も完全一致でないので除外しない
    const notExcluded5 = isExcludedByNames("一般会計", " 公債費", "公債費 ", "公債費");
    // 最後の item が完全一致なので除外されるが、前後の空白は別扱い
    // item = "公債費" は一致するので除外、だが " 公債費" は不一致
    assert.equal(notExcluded5.excluded, true); // item が一致する
    const notExcluded6 = isExcludedByNames("一般会計", " 公債費", "公債費 ", " 公債費 ");
    assert.equal(notExcluded6.excluded, false);
  });

  it("通常の政策事業は除外されない", () => {
    const result = isExcludedByNames("一般会計", "教育費", "教育総務費", "教育指導費");
    assert.equal(result.excluded, false);
    assert.equal(result.reasonCode, null);
    assert.equal(result.matchedKeyword, null);
  });

  it("除外されても理由付きで保持できる（削除しない）", () => {
    const key: ExecutionAccountKey = {
      account: "一般会計",
      chapter: "予備費",
      section: "予備費",
      item: "予備費",
      key: "一般会計:予備費:予備費:予備費",
    };
    const result = checkExclusion(key);
    assert.equal(result.excluded, true);
    // 呼び出し側は excluded で分岐し、データを削除せず理由を保持できる
    const record = { key, exclusion: result };
    assert.equal(record.exclusion.reasonCode, "reserve-fund");
    assert.equal(record.key.chapter, "予備費");
  });

  it("入力を変更しない", () => {
    const key: ExecutionAccountKey = {
      account: "一般会計",
      chapter: "総務費",
      section: "総務管理費",
      item: "一般管理費",
      key: "一般会計:総務費:総務管理費:一般管理費",
    };
    const copy = { ...key };
    checkExclusion(key);
    assert.deepEqual(key, copy);
  });
});
