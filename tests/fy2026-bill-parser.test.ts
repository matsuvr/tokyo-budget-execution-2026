import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseBudgetBillExpenditure } from "../src/execution-review/budget/fy2026-bill-parser.ts";

const SAMPLE = `
令和8年 度 東 京 都 一 般 会 計 予 算 は 、 次 に 定 め る と こ ろ に よ る。
(歳入 歳 出 予 算 の 総 額 及 び 区分)
第1条 歳 入 歳 出 予 算 の 総 額 は 、 歳 入 歳 出 そ れ ぞれ9,653,000,000千 円 と定 め る。

      第1号   歳入歳 出予 算
      歳入                                                         (単位          千 円)
               科                     目
                                                        金   額
           款                         項
01都   税                                                     7,385,632,321
                   01   都民税                                 2,417,792,833
      歳出                                                  (単位         千 円)
               科                       目
                                                金   額
           款                           項
01議   会費                                                   6,010,000
                   01   都議会費                               6,010,000
02総   務費                                                396,719,000
                   01   総務管理費                            69,224,104
                   02   課税費                                14,637,000

                                第2号      繰越 明許費
`;

describe("parseBudgetBillExpenditure", () => {
  it("歳出節の款・項行を抽出する", () => {
    const result = parseBudgetBillExpenditure(SAMPLE);
    assert.equal(result.started, true);
    assert.equal(result.lines.length, 5);
    const kan = result.lines.filter((line) => line.level === "kan");
    assert.deepEqual(
      kan.map((line) => `${line.number}:${line.name}`),
      ["1:議会費", "2:総務費"],
    );
    assert.equal(kan[0].initialBudgetYen, 6_010_000_000);
    const kou = result.lines.filter((line) => line.level === "kou");
    assert.equal(kou.length, 3);
    assert.equal(kou[0].name, "都議会費");
    assert.equal(kou[0].initialBudgetYen, 6_010_000_000);
  });

  it("歳入側の行を収集しない", () => {
    const result = parseBudgetBillExpenditure(SAMPLE);
    assert.ok(!result.lines.some((line) => line.name.includes("都税")));
    assert.ok(!result.lines.some((line) => line.name === "都民税"));
  });

  it("第2号以降は読まない", () => {
    const result = parseBudgetBillExpenditure(SAMPLE);
    assert.ok(!result.lines.some((line) => line.name.includes("繰越")));
  });
});
