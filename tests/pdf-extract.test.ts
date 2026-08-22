import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  extractPageTextItems,
  normalizePdfTextItems,
  type RawPdfTextItem,
} from "../src/execution-review/pdf/extract-text-items.ts";

function item(text: string, x: number, y: number): RawPdfTextItem {
  return { str: text, transform: [1, 0, 0, 1, x, y], width: text.length * 7, height: 7 };
}

describe("normalizePdfTextItems", () => {
  it("y降順・x昇順の安定した順序へ正規化する", () => {
    const items = normalizePdfTextItems(1, [item("B", 200, 100), item("A", 100, 200), item("C", 50, 100), item("D", 150, 300)]);
    assert.deepEqual(
      items.map((entry) => entry.text),
      ["D", "A", "C", "B"],
    );
  });

  it("空文字列と空白のみの項目を破棄する", () => {
    const items = normalizePdfTextItems(1, [item("", 10, 10), { str: " ", transform: [1, 0, 0, 1, 20, 20] }, item("金", 30, 30)]);
    assert.equal(items.length, 1);
    assert.equal(items[0].text, "金");
  });

  it("文字列内の半角空白・全角空白・全角記号を保持する", () => {
    const items = normalizePdfTextItems(1, [
      item("当 初 予 算 額", 100, 500),
      item("△1,234", 200, 400),
      item("総務\u3000費", 300, 300),
    ]);
    assert.deepEqual(
      items.map((entry) => entry.text),
      ["当 初 予 算 額", "△1,234", "総務\u3000費"],
    );
  });

  it("座標を小数第2位で丸める", () => {
    const items = normalizePdfTextItems(3, [{ str: "x", transform: [1, 0, 0, 1, 123.456, 78.901], width: 7.005, height: 6.994 }]);
    assert.equal(items[0].x, 123.46);
    assert.equal(items[0].y, 78.9);
    assert.equal(items[0].width, 7.01);
    assert.equal(items[0].height, 6.99);
    assert.equal(items[0].page, 3);
  });

  it("transformを持たない項目はNaN座標になるが破棄しない", () => {
    const items = normalizePdfTextItems(1, [{ str: "孤" }]);
    assert.equal(items.length, 1);
    assert.equal(Number.isNaN(items[0].x), true);
  });

  it("ページ番号は1始まりの整数のみ受理する", () => {
    assert.throws(() => normalizePdfTextItems(0, []), RangeError);
    assert.throws(() => normalizePdfTextItems(1.5, []), RangeError);
  });
});

describe("extractPageTextItems（代表ページfixture）", () => {
  const fixturePath = join(import.meta.dirname, "fixtures/pdf/settlement-detail-page-120.json");
  const pdfPath = join(
    import.meta.dirname,
    "../data/raw/execution-review/fy2024/settlement/general-account-settlement-detail.pdf",
  );

  it("fixtureは科目名と金額文字列を含み、順序が保たれている", async () => {
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as {
      physicalPage: number;
      itemCount: number;
      items: Array<{ text: string; x: number; y: number; page: number }>;
    };
    assert.equal(fixture.physicalPage, 120);
    assert.equal(fixture.items.length, fixture.itemCount);
    const texts = fixture.items.map((item) => item.text);
    // 日本語の科目名
    assert.ok(texts.some((text) => text.includes("総務費")));
    assert.ok(texts.some((text) => text.includes("総 務 管 理 費")));
    // 金額文字列
    assert.ok(texts.includes("164,339,573,000"));
    assert.ok(texts.includes("368,474,000,000"));
    // 全項目が同じ物理ページで、ソート不変条件を満たす
    for (const [index, entry] of fixture.items.entries()) {
      assert.equal(entry.page, 120);
      if (index > 0) {
        const previous = fixture.items[index - 1];
        assert.ok(previous.y > entry.y || (previous.y === entry.y && previous.x <= entry.x));
      }
    }
  });

  it("実PDFの1物理ページから抽出結果を再現できる（原本がある環境のみ）", async (t) => {
    if (!existsSync(pdfPath)) {
      t.skip("原本PDFがローカルに存在しないためスキップ");
      return;
    }
    const bytes = new Uint8Array(await readFile(pdfPath));
    const items = await extractPageTextItems(bytes, 120);
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as { items: unknown[] };
    assert.deepEqual(items, fixture.items);
  });

  it("存在しないページではエラーになる", async (t) => {
    if (!existsSync(pdfPath)) {
      t.skip("原本PDFがローカルに存在しないためスキップ");
      return;
    }
    const bytes = new Uint8Array(await readFile(pdfPath));
    await assert.rejects(extractPageTextItems(bytes, 999_999));
  });
});
