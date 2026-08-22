import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  splitEmbeddedAmountItems,
  type PdfTextItem,
} from "../src/execution-review/pdf/extract-text-items.ts";
import {
  alignSpreadRows,
} from "../src/execution-review/settlement/align-spread-rows.ts";
import {
  createSettlementHierarchyTracker,
} from "../src/execution-review/settlement/reconstruct-hierarchy.ts";

function textItem(text: string, x: number, y: number, width = 7): PdfTextItem {
  return { text, x, y, width, height: 7, page: 1 };
}

describe("splitEmbeddedAmountItems", () => {
  it("隣接列を取り込んだ金額項目を右端揃えで分割する", () => {
    const items = splitEmbeddedAmountItems([textItem("0 1,145,795,413,000", 384.15, 733, 60.39)]);
    assert.equal(items.length, 2);
    assert.equal(items[0].text, "0");
    assert.equal(items[0].x, 384.15);
    assert.equal(items[1].text, "1,145,795,413,000");
    // 後半は右端揃えなので右端Xが元項目と一致する
    assert.ok(Math.abs(items[1].x + items[1].width - (384.15 + 60.39)) < 0.01);
  });

  it("分割不要な項目はそのまま保持する", () => {
    const single = [textItem("89,434,821,000", 397.6, 733, 47)];
    assert.deepEqual(splitEmbeddedAmountItems(single), single);
    const noAmount = [textItem("総務費", 90, 700)];
    assert.deepEqual(splitEmbeddedAmountItems(noAmount), noAmount);
  });
});

describe("alignSpreadRows", () => {
  const columns = [{ name: "amount", xMin: 0, xMax: 100 }];

  function row(y: number, amount: string) {
    return { y, cells: { amount }, cellX: { amount: y } };
  }

  it("裏ページのみの小計行をスキップして正しく対応付ける", () => {
    // 表: 款734/項710/目687、裏: 款734/項小計695/目687
    const front = [row(687, "14,277"), row(710, "62,437"), row(734, "525,048")];
    const back = [
      row(687, "14,277b"),
      row(695, "56,182"),
      row(710, "62,437b"),
      row(734, "525,048b"),
    ];
    const merged = alignSpreadRows(front, back);
    const byY = new Map(merged.map((entry) => [Math.round(entry.y), entry]));
    // 対応付けられた行は表ページ（front）の値を優先して保持する
    assert.equal(byY.get(734)?.cells.amount, "525,048");
    assert.equal(byY.get(710)?.cells.amount, "62,437");
    assert.equal(byY.get(687)?.cells.amount, "14,277");
    assert.equal(byY.get(687)?.paired, true);
    const unpaired = merged.filter((entry) => !entry.paired);
    assert.equal(unpaired.length, 1);
    assert.equal(unpaired[0].sources[0], "back");
    assert.equal(unpaired[0].cells.amount, "56,182");
  });

  it("同一グリッドの行はすべて対になる", () => {
    const front = [row(300, "a"), row(200, "b")];
    const back = [row(301, "a2"), row(201, "b2")];
    const merged = alignSpreadRows(front, back);
    assert.equal(merged.length, 2);
    assert.ok(merged.every((entry) => entry.paired));
  });
});

describe("createSettlementHierarchyTracker（段階的な呼び出し）", () => {
  const options = {
    kan: { codeColumn: "kanCode", nameColumns: ["kanName"] },
    kou: { codeColumn: "kouCode", nameColumns: [] },
    moku: { codeColumn: "mokuCell", nameColumns: [] },
    amountPattern: /\d{1,3}(?:,\d{3})+/,
  };

  function row(page: number, cells: Record<string, string>) {
    return { page, cells, y: 0, cellX: {} };
  }

  it("見開きをまたいで款・項の状態を引き継ぐ", () => {
    const tracker = createSettlementHierarchyTracker(options);
    const first = tracker.annotate([
      row(120, { kanCode: "02", kanName: "総務費" }),
      row(120, { kouCode: "01" }),
    ]);
    assert.equal(first[0].kind, "kan");
    assert.equal(first[1].kind, "kou");
    // 次の見開きに款・項なしで目だけが現れても例外にならない
    const second = tracker.annotate([row(122, { mokuCell: "02財務管理費" })]);
    assert.equal(second[0].hierarchy.kan?.code, "02");
    assert.equal(second[0].hierarchy.kou?.code, "01");
    assert.equal(second[0].stableKey, "02:総務費/01:/02:財務管理費");
  });
});

describe("settlement-rows.jsonl（生成済み中間データ）", () => {
  it("代表レコードが保存されていれば会計恒等式の前提を満たす", async () => {
    const path = join(
      import.meta.dirname,
      "../data/normalized/execution-review/fy2024/settlement-rows.jsonl",
    );
    try {
      const content = await readFile(path, "utf8");
      const lines = content.trim().split("\n").filter((line) => line.length > 0);
      assert.ok(lines.length > 5000, "レコード数が妥当");
      const first = JSON.parse(lines[0]) as { pageNumber: number; parseStatus: string };
      assert.equal(first.pageNumber, 116);
      assert.equal(first.parseStatus, "ok");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  });
});
