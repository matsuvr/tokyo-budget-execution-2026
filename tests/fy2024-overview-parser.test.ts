import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseBudgetOverviewPage,
} from "../src/execution-review/budget/fy2024-overview-parser.ts";
import type { PdfTextItem } from "../src/execution-review/pdf/extract-text-items.ts";

function item(text: string, x: number, y: number, width = text.length * 6): PdfTextItem {
  return { text, x, y, width, height: 7, page: 1 };
}

describe("parseBudgetOverviewPage", () => {
  it("款ヘッダーと金額帯を対応付ける", () => {
    const { headers, amounts } = parseBudgetOverviewPage(6, [
      item("第１款", 71, 717),
      item("議会費", 104, 717),
      item("（議会局所管）", 134, 717),
      item("６年度", 123, 701),
      item("５年度", 195, 701),
      item("比較", 256, 701),
      item("千円", 133, 692),
      item("千円", 205, 692),
      item("千円", 272, 692),
      item("5,419,000", 108, 679),
      item("5,841,000", 181, 679),
      item("△", 242, 679),
      item("422,000", 256, 679),
      // 右列は別コンテンツ（誤検知させない）
      item("27,937,000", 343, 663),
      item("16,231,000", 415, 663),
      item("11,706,000", 482, 663),
    ]);
    assert.equal(headers.length, 1);
    assert.equal(headers[0].kind, "kan");
    assert.equal(headers[0].number, "1");
    assert.equal(headers[0].name, "議会費");
    assert.equal(headers[0].column, "left");
    assert.equal(amounts.length, 1);
    assert.equal(amounts[0].column, "left");
    assert.equal(amounts[0].currentYearToken, "5,419,000");
  });

  it("分断された数値フラグメントを連結して復元する", () => {
    const { amounts } = parseBudgetOverviewPage(26, [
      item("第18款", 309, 457),
      item("予備費", 351, 457),
      item("（財務局所管）", 381, 457),
      item("６年度", 361, 408),
      item("５年度", 433, 408),
      item("比較", 495, 408),
      item("千円", 371, 400),
      item("千円", 443, 400),
      item("千円", 510, 400),
      item("5,000,000", 348, 387),
      item("5,000,000", 420, 387),
      item("－", 516, 387),
    ]);
    assert.equal(amounts.length, 1);
    assert.equal(amounts[0].currentYearToken, "5,000,000");
  });

  it("項ヘッダー（番号+名称+所管）を抽出する", () => {
    const { headers } = parseBudgetOverviewPage(8, [
      item("11", 71, 717),
      item("その他", 88, 717),
      item("（総務局、会計管理局、", 117, 717),
      item("監査事務局所管）", 81, 701),
      item("６年度", 123, 684),
      item("５年度", 195, 684),
      item("比較", 256, 684),
      item("千円", 133, 676),
      item("千円", 205, 676),
      item("千円", 272, 676),
      item("7,601,277", 109, 668),
      item("7,083,471", 181, 668),
      item("517", 256, 668),
      item(",", 270, 668),
      item("806", 272, 668),
    ]);
    const kou = headers.find((header) => header.kind === "kou");
    assert.ok(kou, "項ヘッダーが検出される");
    assert.equal(kou.number, "11");
    assert.equal(kou.name, "その他");
  });

  it("敘述文の数値を含む行を金額帯として誤検知しない", () => {
    const { amounts } = parseBudgetOverviewPage(1, [
      item("都税の令和６年度当初予算額は、3.0％増の", 80, 700),
      item("6,386,470,478百万円を計上した。", 80, 684),
      item("この予算額は、直近までの都税調定収入実績を踏まえ", 80, 668),
    ]);
    assert.equal(amounts.length, 0);
  });
});
