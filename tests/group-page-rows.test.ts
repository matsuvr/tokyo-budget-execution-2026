import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PdfTextItem } from "../src/execution-review/pdf/extract-text-items.ts";
import {
  filterStructuralRows,
  groupPageRows,
  mergeWrappedNameRows,
} from "../src/execution-review/settlement/group-page-rows.ts";
import {
  DATA_ROW_HEURISTICS,
  SETTLEMENT_DETAIL_EXPENDITURE_FRONT_COLUMNS,
  WRAPPED_NAME_COLUMNS,
} from "../src/execution-review/settlement/page-layouts.ts";

function textItem(text: string, x: number, y: number): PdfTextItem {
  return { text, x, y, width: 7, height: 7, page: 1 };
}

const columns = [
  { name: "name", xMin: 0, xMax: 100 },
  { name: "amount", xMin: 100, xMax: 200 },
];

describe("groupPageRows", () => {
  it("近いY座標の項目を同一行へまとめる", () => {
    const rows = groupPageRows(
      [textItem("費", 10, 100), textItem("総務", 5, 101), textItem("1,000", 120, 100)],
      { columns },
    );
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].cells, { name: "総務費", amount: "1,000" });
  });

  it("Y座標が離れた項目は別行にする", () => {
    const rows = groupPageRows([textItem("A", 10, 300), textItem("B", 10, 280)], { columns });
    assert.equal(rows.length, 2);
  });

  it("どの列にも属さない項目を破棄する", () => {
    const rows = groupPageRows([textItem("外", 500, 100)], { columns });
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].cells, {});
  });

  it("行は上から下の順序で返る", () => {
    const rows = groupPageRows(
      [textItem("下", 10, 100), textItem("上", 10, 200), textItem("中", 10, 150)],
      { columns },
    );
    assert.deepEqual(
      rows.map((row) => row.cells.name),
      ["上", "中", "下"],
    );
  });

  it("同一セル内はX昇順で結合する", () => {
    const rows = groupPageRows(
      [textItem("額", 60, 100), textItem("予", 20, 100), textItem("算", 40, 100)],
      { columns },
    );
    assert.equal(rows[0].cells.name, "予算額");
  });
});

describe("mergeWrappedNameRows", () => {  it("名称のみの継続行を直前の行へ後方結合する", () => {
    const merged = mergeWrappedNameRows(
      [
        { y: 502, cells: { sectionCode: "05", sectionName: "管理職手", amount: "132,611,000" } },
        { y: 494, cells: { sectionName: "当" } },
      ],
      { nameColumns: WRAPPED_NAME_COLUMNS },
    );
    assert.equal(merged.length, 1);
    assert.equal(merged[0].cells.sectionName, "管理職手当");
    assert.equal(merged[0].cells.amount, "132,611,000");
  });

  it("結合先がない継続行はそのまま残す", () => {
    const merged = mergeWrappedNameRows([{ y: 100, cells: { name: "孤立" } }], {
      nameColumns: ["name"],
    });
    assert.equal(merged.length, 1);
    assert.equal(merged[0].cells.name, "孤立");
  });
});

describe("filterStructuralRows", () => {
  const heuristics = DATA_ROW_HEURISTICS;

  it("ヘッダー・単位行・ページ番号・空行を除外する", () => {
    const kept = filterStructuralRows(
      [
        { y: 826, cells: { name: "１一般会計歳出２総務費" } },
        { y: 805, cells: { name: "科目", amount: "予算現額" } },
        { y: 742, cells: { supplementaryBudget: "円円", total: "円" } },
        { y: 64, cells: {} },
        { y: 734, cells: { name: "02総務費", amount: "368,474,000,000" } },
      ],
      heuristics,
    );
    assert.equal(kept.length, 1);
    assert.equal(kept[0].cells.name, "02総務費");
  });

  it("金額もコードもないデータ片は除外する", () => {
    const kept = filterStructuralRows([{ y: 100, cells: { name: "備考" } }], heuristics);
    assert.equal(kept.length, 0);
  });
});

describe("代表ページ（物理ページ120）の復元", () => {
  async function loadFixtureRows() {
    const fixturePath = join(import.meta.dirname, "fixtures/pdf/settlement-detail-page-120.json");
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as {
      items: PdfTextItem[];
    };
    return fixture.items;
  }

  it("科目行と節行を復元し、代表セルの値が目視確認と一致する", async () => {
    const items = await loadFixtureRows();
    const rows = mergeWrappedNameRows(
      filterStructuralRows(
        groupPageRows(items, { columns: SETTLEMENT_DETAIL_EXPENDITURE_FRONT_COLUMNS }),
        DATA_ROW_HEURISTICS,
      ),
      { nameColumns: WRAPPED_NAME_COLUMNS },
    );

    // 款02 総務費 行: 予算現額計（コードは科目名の前に復元される）
    const sohmuRow = rows.find((row) => row.cells.accountAndName?.startsWith("02総務費"));
    assert.ok(sohmuRow, "款02総務費の行が存在する");
    assert.equal(sohmuRow.cells.initialBudget, "368,474,000,000");
    assert.equal(sohmuRow.cells.supplementaryBudget, "164,339,573,000");
    assert.equal(sohmuRow.cells.currentBudgetTotal, "608,605,218,000");

    // 項01 総務管理費 行: 負数は「△」が金額文字列に後置される
    const kanriRow = rows.find((row) => row.cells.accountAndName?.startsWith("01総 務 管 理 費"));
    assert.ok(kanriRow, "項01総務管理費の行が存在する");
    assert.ok(kanriRow.cells.initialBudget?.endsWith("△"), "負数の△が保持される");
    assert.equal(kanriRow.cells.supplementaryBudget, "992,309,000");

    // 折り返し科目名が同一行へ取り込まれている
    assert.ok(
      rows.some((row) => row.cells.sectionName === "05管理職手当"),
      "折り返した節名が結合されている",
    );

    // 目視確認済みの行数: 左側の階層行3本＋右側の節行24本＝27行
    assert.equal(rows.length, 27);
  });
});
