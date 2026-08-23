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

interface ItemAccumulator {
  item: ExecutionAttentionItem;
  itemBucket: Bucket;
  sectionBucket: Bucket;
  chapterBucket: Bucket;
}

function bucket(): Bucket {
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
  values.sort((a, b) =>
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
 * Builds indexed accumulators so each transaction is not compared with every attention item.
 * The result selects the most specific non-empty evidence bucket and records that granularity.
 */
export function createAttentionPaymentEvidenceBuilder(
  items: readonly ExecutionAttentionItem[],
): AttentionPaymentEvidenceBuilder {
  const accumulators = new Map<string, ItemAccumulator>();
  const itemIndex = new Map<string, string[]>();
  const sectionIndex = new Map<string, string[]>();
  const chapterIndex = new Map<string, string[]>();

  function indexAdd(index: Map<string, string[]>, indexKey: string, itemId: string): void {
    const ids = index.get(indexKey) ?? [];
    ids.push(itemId);
    index.set(indexKey, ids);
  }

  for (const item of items) {
    if (accumulators.has(item.itemId)) throw new Error(`duplicate itemId: ${item.itemId}`);
    accumulators.set(item.itemId, {
      item,
      itemBucket: bucket(),
      sectionBucket: bucket(),
      chapterBucket: bucket(),
    });
    indexAdd(
      itemIndex,
      key([item.accountKey.account, item.accountKey.chapter, item.accountKey.section, item.accountKey.item]),
      item.itemId,
    );
    indexAdd(
      sectionIndex,
      key([item.accountKey.account, item.accountKey.chapter, item.accountKey.section]),
      item.itemId,
    );
    indexAdd(
      chapterIndex,
      key([item.accountKey.account, item.accountKey.chapter]),
      item.itemId,
    );
  }

  function addForIds(
    ids: readonly string[] | undefined,
    level: keyof Pick<ItemAccumulator, "itemBucket" | "sectionBucket" | "chapterBucket">,
    transaction: AttentionPaymentTxn,
  ): void {
    for (const itemId of ids ?? []) {
      const accumulator = accumulators.get(itemId);
      if (accumulator != null) addToBucket(accumulator[level], transaction);
    }
  }

  return {
    add(transaction): void {
      if (normalize(transaction.account) !== normalize("一般会計")) return;
      addForIds(
        itemIndex.get(key([transaction.account, transaction.chapter, transaction.item, transaction.object])),
        "itemBucket",
        transaction,
      );
      addForIds(
        sectionIndex.get(key([transaction.account, transaction.chapter, transaction.item])),
        "sectionBucket",
        transaction,
      );
      addForIds(
        chapterIndex.get(key([transaction.account, transaction.chapter])),
        "chapterBucket",
        transaction,
      );
    },
    finalize(): AttentionPaymentEvidence[] {
      const results: AttentionPaymentEvidence[] = [];
      for (const { item, itemBucket, sectionBucket, chapterBucket } of accumulators.values()) {
        const choice: [AttentionPaymentMatchGranularity, Bucket] =
          itemBucket.transactionCount > 0
            ? ["item", itemBucket]
            : sectionBucket.transactionCount > 0
              ? ["section", sectionBucket]
              : chapterBucket.transactionCount > 0
                ? ["chapter", chapterBucket]
                : ["none", itemBucket];
        const [matchGranularity, selected] = choice;
        results.push({
          itemId: item.itemId,
          comparisonId: item.comparison?.comparisonId ?? null,
          matchGranularity,
          transactionCount: selected.transactionCount,
          totalAmountYen: selected.totalAmountYen,
          ordinaryAmountYen: selected.ordinaryAmountYen,
          closingAmountYen: selected.closingAmountYen,
          firstPaymentDate: selected.firstPaymentDate,
          lastPaymentDate: selected.lastPaymentDate,
          topPaymentNames: sorted(selected.names, 10),
          expenseBreakdown: sorted(selected.expenses),
        });
      }
      return results.sort((a, b) => a.itemId.localeCompare(b.itemId, "ja"));
    },
  };
}
