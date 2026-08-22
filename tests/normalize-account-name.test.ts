import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeAccountName } from "../src/execution-review/mapping/normalize-account-name.ts";

describe("normalizeAccountName", () => {
  it("空白と全角空白を除去する", () => {
    assert.equal(normalizeAccountName("総 務 管 理 費"), "総務管理費");
    assert.equal(normalizeAccountName("総務\u3000費"), "総務費");
  });

  it("括弧書きの補足を除去する", () => {
    assert.equal(normalizeAccountName("福祉費（一部事務）"), "福祉費");
    assert.equal(normalizeAccountName("消防費(東京消防庁所管)"), "消防費");
    assert.equal(normalizeAccountName("予備費（令和8年度新設）"), "予備費");
  });

  it("全角英数字を半角へ置き換える", () => {
    assert.equal(normalizeAccountName("第２次補正"), "第2次補正");
    assert.equal(normalizeAccountName("ＡＩ推進費"), "AI推進費");
  });

  it("正規化後も異なる名称は一致しない", () => {
    assert.notEqual(normalizeAccountName("生活文化スポーツ費"), normalizeAccountName("生活文化費"));
  });
});
