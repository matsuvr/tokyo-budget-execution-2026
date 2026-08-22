import { normalizeAccountName } from "./normalize-account-name.ts";

/**
 * 公金支出トランザクションから、比較候補ごとの支払件名等の補助証拠を
 * 集計する純粋関数群（Issue #33）。
 * - 対応表の比較粒度に従い、会計・款・（項）が一致する支払だけを収集する。
 * - 支払件名は原文を保持し、金額を決算の支出済額へ上書きしない。
 */

export interface PaymentTxn {
  account: string;
  chapter: string;
  item: string;
  /** 支払内容（件名）。原文を保持する。 */
  description: string;
  /** 節 */
  expenseSection: string;
  /** 細節 */
  expenseSubsection: string | null;
  amountYen: number;
  paidAt: string | null;
  isClosingPeriod: boolean;
}

export interface EvidenceCandidateSpec {
  comparisonId: string;
  mappingId: string;
  confidence: string;
  relationType: string;
  granularity: string;
  /** 2024側の科目キー（raw表記）。複数可（merged/split）。 */
  keys: readonly { chapter: string; section?: string }[];
}

export interface NameAggregate {
  name: string;
  count: number;
  amountYen: number;
}

export interface PaymentEvidence extends EvidenceCandidateSpec {
  matchedAccount: {
    account: string;
    chapter: string;
    section: string | null;
  };
  transactionCount: number;
  totalAmountYen: number;
  ordinaryAmountYen: number;
  closingAmountYen: number;
  firstPaymentDate: string | null;
  lastPaymentDate: string | null;
  /** 支払件名別 上位10件（金額降順、同順は件数降順→名称順） */
  topPaymentNames: NameAggregate[];
  /** 節・細節別の件数・金額（金額降順） */
  expenseBreakdown: NameAggregate[];
}

export const PAYMENT_NAME_TOP_N = 10;

/** 候補1件ぶんの集計器。状態はクロージャ内でのみ保持する。 */
export interface PaymentEvidenceCollector {
  readonly spec: EvidenceCandidateSpec;
  /** マッチした場合true。マッチ条件は比較粒度に従う。 */
  add(transaction: PaymentTxn): boolean;
  finalize(): PaymentEvidence;
}

function normalize(value: string): string {
  return normalizeAccountName(value ?? "");
}

/** 対応表キーの先頭コード（例: "02:"）を除いて正規化する。 */
function keyNormalize(value: string): string {
  return normalize(value.replace(/^[0-9]{1,2}[:：]/u, ""));
}

interface Accumulator {
  count: number;
  amountYen: number;
}

function increment(map: Map<string, Accumulator>, name: string, amount: number): void {
  const entry = map.get(name) ?? { count: 0, amountYen: 0 };
  entry.count += 1;
  entry.amountYen += amount;
  map.set(name, entry);
}

function sortedAggregates(map: Map<string, Accumulator>, limit?: number): NameAggregate[] {
  const entries = [...map.entries()].map(([name, agg]) => ({
    name,
    count: agg.count,
    amountYen: agg.amountYen,
  }));
  entries.sort(
    (a, b) =>
      b.amountYen - a.amountYen ||
      b.count - a.count ||
      a.name.localeCompare(b.name, "ja"),
  );
  return limit == null ? entries : entries.slice(0, limit);
}

export function createPaymentEvidenceCollector(spec: EvidenceCandidateSpec): PaymentEvidenceCollector {
  const isItemGranularity = spec.granularity === "item";
  // 対応キー集合（正規化名）
  const chapterNames = new Set<string>();
  const sectionByChapter = new Map<string, Set<string>>();
  for (const key of spec.keys) {
    const chapter = keyNormalize(key.chapter);
    if (chapter.length === 0) continue;
    chapterNames.add(chapter);
    if (!sectionByChapter.has(chapter)) sectionByChapter.set(chapter, new Set());
    if (isItemGranularity && key.section != null && key.section !== "") {
      sectionByChapter.get(chapter)?.add(keyNormalize(key.section));
    }
  }

  let transactionCount = 0;
  let totalAmountYen = 0;
  let ordinaryAmountYen = 0;
  let closingAmountYen = 0;
  let firstPaymentDate: string | null = null;
  let lastPaymentDate: string | null = null;
  const paymentNames = new Map<string, Accumulator>();
  const expenses = new Map<string, Accumulator>();

  return {
    spec,
    add(transaction: PaymentTxn): boolean {
      if (normalize(transaction.account) !== "一般会計") return false;
      const chapter = normalize(transaction.chapter);
      if (!chapterNames.has(chapter)) return false;
      if (isItemGranularity) {
        const sections = sectionByChapter.get(chapter);
        const item = normalize(transaction.item);
        if (sections == null || !sections.has(item)) return false;
      }
      const amount = transaction.amountYen;
      transactionCount += 1;
      totalAmountYen += amount;
      if (transaction.isClosingPeriod) closingAmountYen += amount;
      else ordinaryAmountYen += amount;
      if (transaction.paidAt != null) {
        if (firstPaymentDate == null || transaction.paidAt < firstPaymentDate) {
          firstPaymentDate = transaction.paidAt;
        }
        if (lastPaymentDate == null || transaction.paidAt > lastPaymentDate) {
          lastPaymentDate = transaction.paidAt;
        }
      }
      if (transaction.description.trim().length > 0) {
        increment(paymentNames, transaction.description, amount);
      }
      const expenseLabel =
        transaction.expenseSubsection != null && transaction.expenseSubsection.length > 0
          ? `${transaction.expenseSection} / ${transaction.expenseSubsection}`
          : transaction.expenseSection;
      if (expenseLabel.trim().length > 0) {
        increment(expenses, expenseLabel, amount);
      }
      return true;
    },
    finalize(): PaymentEvidence {
      const firstChapter = [...chapterNames][0] ?? "";
      const firstSpecKey = spec.keys[0];
      return {
        ...spec,
        matchedAccount: {
          account: "一般会計",
          chapter: firstSpecKey?.chapter ?? firstChapter,
          section: firstSpecKey?.section ?? null,
        },
        transactionCount,
        totalAmountYen,
        ordinaryAmountYen,
        closingAmountYen,
        firstPaymentDate,
        lastPaymentDate,
        topPaymentNames: sortedAggregates(paymentNames, PAYMENT_NAME_TOP_N),
        expenseBreakdown: sortedAggregates(expenses),
      };
    },
  };
}
