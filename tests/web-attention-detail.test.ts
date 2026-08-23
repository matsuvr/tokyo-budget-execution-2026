import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sortBreakdownComponentsByUnexecutedAmount } from "../web/attention-detail-sort.ts";

describe("attention detail unexecuted ranking", () => {
  it("支出済額ではなく年度内執行ギャップ額の降順に並べる", () => {
    const input = [
      {
        accountKey: { key: "a" },
        amounts: { yearEndUnexecutedYen: 10, spentYen: 1_000 },
      },
      {
        accountKey: { key: "b" },
        amounts: { yearEndUnexecutedYen: 200, spentYen: 1 },
      },
    ];

    const sorted = sortBreakdownComponentsByUnexecutedAmount(input);

    assert.deepEqual(
      sorted.map((record) => record.accountKey.key),
      ["b", "a"],
    );
    assert.deepEqual(
      input.map((record) => record.accountKey.key),
      ["a", "b"],
    );
  });

  it("年度内執行ギャップ額が同じ場合はaccountKey.key昇順にする", () => {
    const sorted = sortBreakdownComponentsByUnexecutedAmount([
      { accountKey: { key: "z" }, amounts: { yearEndUnexecutedYen: 20 } },
      { accountKey: { key: "a" }, amounts: { yearEndUnexecutedYen: 20 } },
    ]);

    assert.deepEqual(
      sorted.map((record) => record.accountKey.key),
      ["a", "z"],
    );
  });

  it("通常表示で支払件名上位を主ランキングにしない", async () => {
    const source = await readFile(new URL("../web/attention-detail.ts", import.meta.url), "utf8");

    assert.match(source, /年度内執行ギャップ額が大きい構成明細/u);
    assert.match(source, /年度内執行ギャップ額/u);
    assert.match(source, /年度内執行ギャップ率/u);
    assert.match(source, /実際に支出された内容（公金支出）/u);
    assert.doesNotMatch(source, /実際に支出された内容（公金支出・参考）/u);
    assert.doesNotMatch(source, /公金支出集計は支出済み内容の補助資料で/u);
    assert.doesNotMatch(source, /正式な決算額や年度内執行ギャップ額の代わりにはしません/u);
    assert.doesNotMatch(source, /aggregateList\("支払件名上位"/u);
  });
});
