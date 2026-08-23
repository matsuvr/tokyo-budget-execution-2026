import { normalizeAccountName } from "./mapping/normalize-account-name.ts";
import type { NameAggregate, PaymentTxn } from "./mapping/payment-evidence.ts";
import type { ExecutionAttentionItem } from "./types.ts";

export interface AttentionPaymentTxn extends PaymentTxn {
  /** 公金支出の目。旧PaymentTxn契約では未使用だったため加法的に扱う。 */
  object?: string;
}

export type AttentionPaymentMatchGranularity = "item" | "section" | "chapter" | "none";

export interface AttentionPaymentEvidence {
  itemId: string;
  comparisonId: string | null;
  matchGranularity: AttentionPaymentMatchGranularity;
  transactionCount: number;
  totalAmountYen: number;
  ordinaryAmountYen: number;
  closingAmountYen: number;
  firstPaymentDate: string | null;
  lastPaymentDate: string | null;
  topPaymentNames: NameAggregate[];
  expenseBreakdown: NameAggregate[];
}

interface Counter {
  count: number;
  amountYen: number;
}

interface Bucket {
  transactionCount: number;
  totalAmountYen: number;
  ordinaryAmountYen: number;
  closingAmountYen: number;
  firstPaymentDate: string | null;
  lastPaymentDate: string | null;
  names: Map<string, Counter>;
  expenses: Map<string, Counter>;
}

function createBucket(): Bucket {
  return {
    transactionCount: 0,
    totalAmountYen: 0,
    ordinaryAmountYen: 0,
    closingAmountYen: 0,
    firstPaymentDate: null,
    lastPaymentDate: null,
    names: new Map(),
    expenses: new Map(),
  };
}

function normalize(value: string | undefined): string {
  return normalizeAccountName(value ?? "").replace(/^[0-9]{1,2}[:：]/u, "");
}

function key(parts: readonly (string | undefined)[]): string {
  return parts.map(normalize).join("|");
}

function bucketFor(map: Map<string, Bucket>, bucketKey: string): Bucket {
  const existing = map.get(bucketKey);
  if (existing != null) return existing;
  const created = createBucket();
  map.set(bucketKey, created);
  return created;
}

function increment(map: Map<string, Counter>, name: string, amountYen: number): void {
  if (name.trim().length === 0) return;
  const current = map.get(name) ?? { count: 0, amountYen: 0 };
  current.count += 1;
  current.amountYen += amountYen;
  map.set(name, current);
}

function addToBucket(target: Bucket, transaction: AttentionPaymentTxn): void {
  target.transactionCount += 1;
  target.totalAmountYen += transaction.amountYen;
  if (transaction.isClosingPeriod) target.closingAmountYen += transaction.amountYen;
  else target.ordinaryAmountYen += transaction.amountYen;
  if (transaction.paidAt != null) {
    if (target.firstPaymentDate == null || transaction.paidAt < target.firstPaymentDate) {
      target.firstPaymentDate = transaction.paidAt;
    }
    if (target.lastPaymentDate == null || transaction.paidAt > target.lastPaymentDate) {
      target.lastPaymentDate = transaction.paidAt;
    }
  }
  increment(target.names, transaction.description, transaction.amountYen);
  const expense = transaction.expenseSubsection?.trim()
    ? `${transaction.expenseSection} / ${transaction.expenseSubsection}`
    : transaction.expenseSection;
  increment(target.expenses, expense, transaction.amountYen);
}

function sorted(map: Map<string, Counter>, limit?: number): NameAggregate[] {
  const values = [...map].map(([name, value]) => ({ name, ...value }));
  values.sort(
    (a, b) =>
      b.amountYen - a.amountYen ||
      b.count - a.count ||
      a.name.localeCompare(b.name, "ja"),
  );
  return limit == null ? values : values.slice(0, limit);
}

export interface AttentionPaymentEvidenceBuilder {
  add(transaction: AttentionPaymentTxn): void;
  finalize(): AttentionPaymentEvidence[];
}

/**
 * 各取引を item / section / chapter の一意なキーへ1回ずつ集約する。
 * 配下の全明細ごとに同じMapを複製せず、finalize時に各明細が利用できる
 * 最も具体的な非空bucketを参照するため、大量取引でもメモリ使用量を抑える。
 */
export function createAttentionPaymentEvidenceBuilder(
  items: readonly ExecutionAttentionItem[],
): AttentionPaymentEvidenceBuilder {
  const itemBuckets = new Map<string, Bucket>();
  const sectionBuckets = new Map<string, Bucket>();
  const chapterBuckets = new Map<string, Bucket>();
  const seenItemIds = new Set<string>();
  for (const item of items) {
    if (seenItemIds.has(item.itemId)) throw new Error(`duplicate itemId: ${item.itemId}`);
    seenItemIds.add(item.itemId);
  }

  return {
    add(transaction): void {
      if (normalize(transaction.account) !== normalize("一般会計")) return;
      addToBucket(
        bucketFor(
          itemBuckets,
          key([transaction.account, transaction.chapter, transaction.item, transaction.object]),
        ),
        transaction,
      );
      addToBucket(
        bucketFor(
          sectionBuckets,
          key([transaction.account, transaction.chapter, transaction.item]),
        ),
        transaction,
      );
      addToBucket(
        bucketFor(chapterBuckets, key([transaction.account, transaction.chapter])),
        transaction,
      );
    },
    finalize(): AttentionPaymentEvidence[] {
      return items
        .map((item): AttentionPaymentEvidence => {
          const itemBucket = itemBuckets.get(
            key([
              item.accountKey.account,
              item.accountKey.chapter,
              item.accountKey.section,
              item.accountKey.item,
            ]),
          );
          const sectionBucket = sectionBuckets.get(
            key([item.accountKey.account, item.accountKey.chapter, item.accountKey.section]),
          );
          const chapterBucket = chapterBuckets.get(
            key([item.accountKey.account, item.accountKey.chapter]),
          );
          const choice: [AttentionPaymentMatchGranularity, Bucket | undefined] =
            itemBucket != null && itemBucket.transactionCount > 0
              ? ["item", itemBucket]
              : sectionBucket != null && sectionBucket.transactionCount > 0
                ? ["section", sectionBucket]
                : chapterBucket != null && chapterBucket.transactionCount > 0
                  ? ["chapter", chapterBucket]
                  : ["none", undefined];
          const [matchGranularity, selected] = choice;
          return {
            itemId: item.itemId,
            comparisonId: item.comparison?.comparisonId ?? null,
            matchGranularity,
            transactionCount: selected?.transactionCount ?? 0,
            totalAmountYen: selected?.totalAmountYen ?? 0,
            ordinaryAmountYen: selected?.ordinaryAmountYen ?? 0,
            closingAmountYen: selected?.closingAmountYen ?? 0,
            firstPaymentDate: selected?.firstPaymentDate ?? null,
            lastPaymentDate: selected?.lastPaymentDate ?? null,
            topPaymentNames: selected == null ? [] : sorted(selected.names, 10),
            expenseBreakdown: selected == null ? [] : sorted(selected.expenses),
          };
        })
        .sort((a, b) => a.itemId.localeCompare(b.itemId, "ja"));
    },
  };
}
