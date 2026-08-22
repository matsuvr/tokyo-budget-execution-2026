import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createPaymentEvidenceCollector,
  type PaymentTxn,
} from "../src/execution-review/mapping/payment-evidence.ts";

function txn(overrides: Partial<PaymentTxn>): PaymentTxn {
  return {
    account: "一般会計",
    chapter: "総務費",
    item: "総務管理費",
    description: "テスト支払",
    expenseSection: "報酬",
    expenseSubsection: null,
    amountYen: 1_000,
    paidAt: "2024-05-10",
    isClosingPeriod: false,
    ...overrides,
  };
}

describe("createPaymentEvidenceCollector", () => {
  it("項粒度では款・項が一致する支払だけを収集する", () => {
    const collector = createPaymentEvidenceCollector({
      comparisonId: "cmp-0001",
      mappingId: "map-0001",
      confidence: "A",
      relationType: "exact",
      granularity: "item",
      keys: [{ chapter: "02:総務費", section: "01:総務管理費" }],
    });
    assert.equal(collector.add(txn({})), true);
    assert.equal(collector.add(txn({ item: "財政運営費" })), false); // 項不一致
    const evidence = collector.finalize();
    assert.equal(evidence.transactionCount, 1);
    assert.equal(evidence.totalAmountYen, 1_000);
  });

  it("款粒度では款が一致すれば全て収集する", () => {
    const collector = createPaymentEvidenceCollector({
      comparisonId: "cmp-0002",
      mappingId: "map-0002",
      confidence: "B",
      relationType: "renamed",
      granularity: "chapter",
      keys: [{ chapter: "04:生活文化費" }],
    });
    assert.equal(collector.add(txn({ chapter: "生活文化費", item: "文化振興費" })), true);
    assert.equal(collector.add(txn({ chapter: "総務費" })), false);
    assert.equal(collector.finalize().transactionCount, 1);
  });

  it("一般会計以外の支払を接続しない", () => {
    const collector = createPaymentEvidenceCollector({
      comparisonId: "cmp-0003",
      mappingId: "map-0003",
      confidence: "A",
      relationType: "exact",
      granularity: "chapter",
      keys: [{ chapter: "総務費" }],
    });
    assert.equal(collector.add(txn({ account: "公営企業会計" })), false);
  });

  it("件名上位と節別集計、通常月/出納整理期間、支払日範囲を出力する", () => {
    const collector = createPaymentEvidenceCollector({
      comparisonId: "cmp-0004",
      mappingId: "map-0004",
      confidence: "A",
      relationType: "exact",
      granularity: "item",
      keys: [{ chapter: "02:総務費", section: "01:総務管理費" }],
    });
    collector.add(txn({ description: "Ａ社への委託料", amountYen: 500 }));
    collector.add(txn({ description: "Ａ社への委託料", amountYen: 300 }));
    collector.add(txn({ description: "Ｂ社への委託料", amountYen: 900, paidAt: "2024-04-01" }));
    collector.add(
      txn({
        description: "Ｃ社への賃借料",
        amountYen: 700,
        paidAt: "2025-05-20",
        isClosingPeriod: true,
        expenseSection: "借入金利",
        expenseSubsection: "その他",
      }),
    );
    const evidence = collector.finalize();
    assert.equal(evidence.topPaymentNames[0].name, "Ｂ社への委託料");
    assert.equal(evidence.topPaymentNames[0].amountYen, 900);
    assert.equal(evidence.expenseBreakdown.length, 2);
    assert.equal(evidence.firstPaymentDate, "2024-04-01");
    assert.equal(evidence.lastPaymentDate, "2025-05-20");
    // 通常月と出納整理期間を分けて集計する
    assert.equal(evidence.ordinaryAmountYen + evidence.closingAmountYen, evidence.totalAmountYen);
    assert.ok(evidence.closingAmountYen > 0);
    // 支払件名は原文（全角含む）を保持する
    assert.ok(evidence.topPaymentNames.some((entry) => entry.name === "Ａ社への委託料"));
  });

  it("支払がない候補はゼロ件で残る", () => {
    const collector = createPaymentEvidenceCollector({
      comparisonId: "cmp-0005",
      mappingId: "map-0005",
      confidence: "B",
      relationType: "exact",
      granularity: "item",
      keys: [{ chapter: "18:予備費", section: "01:予備費" }],
    });
    const evidence = collector.finalize();
    assert.equal(evidence.transactionCount, 0);
    assert.equal(evidence.totalAmountYen, 0);
    assert.deepEqual(evidence.topPaymentNames, []);
  });
});
