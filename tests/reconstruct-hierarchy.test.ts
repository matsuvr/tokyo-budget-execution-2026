import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  reconstructHierarchy,
  type ReconstructHierarchyOptions,
} from "../src/execution-review/settlement/reconstruct-hierarchy.ts";

// 明細書の列位置を模したテスト用設定。
const options: ReconstructHierarchyOptions = {
  kan: { codeColumn: "kanCode", nameColumns: ["kanName"] },
  kou: { codeColumn: "kouCode", nameColumns: ["kouName"] },
  moku: { codeColumn: "mokuCell", nameColumns: [] },
  amountPattern: /\d{1,3}(?:,\d{3})+/,
  subtotalPattern: /^(小計|計|合計|累計)$/,
};

function row(page: number, cells: Record<string, string>) {
  return { page, cells, y: 0, cellX: {} };
}

describe("reconstructHierarchy", () => {
  it("同一ページ内の款→項→目を階層化する", () => {
    const annotated = reconstructHierarchy(
      [
        row(120, { kanCode: "02", kanName: "総務費" }),
        row(120, { kouCode: "01", kouName: "総務管理費" }),
        row(120, { mokuCell: "01 総務管理費", sectionSpentAmount: "15,490,368,000" }),
        row(120, { sectionName: "報酬", sectionSpentAmount: "635,285,000" }),
      ],
      options,
    );
    assert.deepEqual(
      annotated.map((entry) => entry.kind),
      ["kan", "kou", "moku", "data"],
    );
    assert.equal(annotated[0].hierarchy.kan?.normalizedName, "総務費");
    assert.equal(annotated[2].stableKey, "02:総務費/01:総務管理費/01:総務管理費");
    // 目の後の数値行は現在の款・項・目を引き継ぐ
    assert.equal(annotated[3].stableKey, annotated[2].stableKey);
  });

  it("項だけが次ページへ継続する", () => {
    const annotated = reconstructHierarchy(
      [
        row(120, { kanCode: "02", kanName: "総務費" }),
        row(120, { kouCode: "01", kouName: "総務管理費" }),
        row(121, { mokuCell: "02 行政管理費" }),
        row(122, { sectionName: "報酬", sectionSpentAmount: "100,000" }),
      ],
      options,
    );
    assert.equal(annotated[2].page, 121);
    assert.equal(annotated[2].hierarchy.kan?.code, "02");
    assert.equal(annotated[2].hierarchy.kou?.code, "01");
    assert.equal(annotated[3].stableKey, "02:総務費/01:総務管理費/02:行政管理費");
  });

  it("款が切り替わると項・目はリセットされる", () => {
    const annotated = reconstructHierarchy(
      [
        row(200, { kanCode: "02", kanName: "総務費" }),
        row(201, { kouCode: "01", kouName: "総務管理費" }),
        row(202, { mokuCell: "01 総務管理費" }),
        row(203, { kanCode: "03", kanName: "徴税費" }),
        row(204, { sectionName: "報酬", sectionSpentAmount: "50,000" }),
      ],
      options,
    );
    assert.equal(annotated[3].kind, "kan");
    assert.equal(annotated[3].hierarchy.kou, null);
    assert.equal(annotated[3].stableKey, null);
    // 款切替直後の数値行は項・目未確定のためfail-closedでnull
    assert.equal(annotated[4].kind, "data");
    assert.equal(annotated[4].hierarchy.kan?.normalizedName, "徴税費");
    assert.equal(annotated[4].hierarchy.moku, null);
    assert.equal(annotated[4].stableKey, null);
  });

  it("小計行は通常の目と区別し、階層は変えない", () => {
    const annotated = reconstructHierarchy(
      [
        row(300, { kanCode: "02", kanName: "総務費" }),
        row(300, { kouCode: "01", kouName: "総務管理費" }),
        row(301, { mokuCell: "01 総務管理費" }),
        row(302, { nameOnly: "計", totalAmount: "61,204,397,000" }),
        row(303, { mokuCell: "02 行政管理費" }),
      ],
      options,
    );
    assert.equal(annotated[3].kind, "subtotal");
    assert.equal(annotated[3].hierarchy.moku?.code, "01");
    assert.equal(annotated[4].hierarchy.kou?.code, "01");
  });

  it("見出し欠損時はfail-closedで例外になる", () => {
    assert.throws(() =>
      reconstructHierarchy([row(400, { kouCode: "01", kouName: "突然の項" })], options),
    );
    assert.throws(() =>
      reconstructHierarchy([row(401, { mokuCell: "01 突然の目" })], options),
    );
  });

  it("分類できない行はnullの階層で残す（入力順序は保持）", () => {
    const annotated = reconstructHierarchy(
      [
        row(500, { garbage: "※注記" }),
        row(500, { kanCode: "01", kanName: "議会費" }),
        row(501, { garbage: "※調整中" }),
      ],
      options,
    );
    assert.equal(annotated[0].kind, "unclassified");
    assert.equal(annotated[0].stableKey, null);
    assert.equal(annotated[0].hierarchy.kan, null);
    assert.equal(annotated[1].kind, "kan");
    assert.equal(annotated[2].kind, "unclassified");
    assert.deepEqual(
      annotated.map((entry) => entry.page),
      [500, 500, 501],
    );
  });

  it("表示名は原文（空白保持）、正規化名は空白除去で安定キーを生成する", () => {
    const annotated = reconstructHierarchy(
      [
        row(600, { kanCode: "02", kanName: "総 務 管 理 費" }),
        row(601, { kouCode: "01", kouName: "総務管理費" }),
        row(602, { mokuCell: "01 総務管理費" }),
      ],
      options,
    );
    assert.equal(annotated[0].hierarchy.kan?.displayName, "総 務 管 理 費");
    assert.equal(annotated[0].hierarchy.kan?.normalizedName, "総務管理費");
    assert.ok(annotated[2].stableKey?.startsWith("02:総務管理費/01:総務管理費/01:"));
  });
});
