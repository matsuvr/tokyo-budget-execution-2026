import { normalizeAccountName } from "./mapping/normalize-account-name.ts";
import { isLeafExecutionRecord, type ScanRecord } from "./settlement/execution-scan.ts";
import type {
  ComparisonSideKey,
  EvidenceReference,
  ExecutionAccountKey,
  ExecutionAttentionItem,
  ExecutionMethod,
} from "./types.ts";

export interface AttentionBreakdownComponent {
  itemId: string;
  bureau: string;
  accountKey: ExecutionAccountKey;
  executionMethod: ExecutionMethod;
  amounts: {
    currentBudgetYen: number;
    spentYen: number;
    carryoverYen: number;
    unusedYen: number;
    yearEndUnexecutedYen: number;
  };
  sourcePage: number | null;
  source: EvidenceReference;
}

export interface AttentionBreakdown {
  itemId: string;
  comparisonId: string | null;
  comparisonLevel: "chapter" | "section" | null;
  components: AttentionBreakdownComponent[];
  totals: AttentionBreakdownComponent["amounts"];
  reconciliation: "exact" | "mismatch" | "not-applicable";
}

export interface ComparisonAmountsForBreakdown {
  comparisonId: string;
  fy2024Keys: ComparisonSideKey[];
  amounts: {
    fy2024CurrentBudgetYen: number | null;
    fy2024SpentYen: number | null;
    fy2024CarryoverYen: number | null;
    fy2024UnusedYen: number | null;
  };
}

function stripCode(value: string): string {
  return normalizeAccountName(value.replace(/^[0-9]{1,2}[:：]/u, ""));
}

function belongsToKey(record: ScanRecord, key: ComparisonSideKey): boolean {
  if (stripCode(record.accountKey.account) !== stripCode(key.account)) return false;
  if (stripCode(record.accountKey.chapter) !== stripCode(key.chapter)) return false;
  if (key.section != null && key.section.trim().length > 0) {
    return stripCode(record.accountKey.section) === stripCode(key.section);
  }
  return true;
}

function toComponent(record: ScanRecord): AttentionBreakdownComponent {
  const bureau = record.bureau.trim().length > 0 ? record.bureau : stripCode(record.accountKey.chapter);
  return {
    itemId: record.accountKey.key,
    bureau,
    accountKey: { ...record.accountKey },
    executionMethod: record.executionMethod,
    amounts: {
      currentBudgetYen: record.currentBudgetYen,
      spentYen: record.spentYen,
      carryoverYen: record.carryoverYen,
      unusedYen: record.unusedYen,
      yearEndUnexecutedYen: record.yearEndUnexecuted.amountYen,
    },
    sourcePage: record.sourcePage,
    source: { ...record.source },
  };
}

function sumComponents(components: readonly AttentionBreakdownComponent[]): AttentionBreakdownComponent["amounts"] {
  const total = {
    currentBudgetYen: 0n,
    spentYen: 0n,
    carryoverYen: 0n,
    unusedYen: 0n,
    yearEndUnexecutedYen: 0n,
  };
  for (const component of components) {
    for (const key of Object.keys(total) as (keyof typeof total)[]) {
      total[key] += BigInt(component.amounts[key]);
    }
  }
  const result = Object.fromEntries(
    Object.entries(total).map(([key, value]) => {
      const number = Number(value);
      if (!Number.isSafeInteger(number)) throw new RangeError(`${key} total exceeds safe integer range`);
      return [key, number];
    }),
  ) as AttentionBreakdownComponent["amounts"];
  return result;
}

function reconcile(
  totals: AttentionBreakdownComponent["amounts"],
  comparison: ComparisonAmountsForBreakdown | null,
): AttentionBreakdown["reconciliation"] {
  if (comparison == null) return "not-applicable";
  const expected = comparison.amounts;
  if (
    expected.fy2024CurrentBudgetYen == null ||
    expected.fy2024SpentYen == null ||
    expected.fy2024CarryoverYen == null ||
    expected.fy2024UnusedYen == null
  ) {
    return "mismatch";
  }
  return totals.currentBudgetYen === expected.fy2024CurrentBudgetYen &&
    totals.spentYen === expected.fy2024SpentYen &&
    totals.carryoverYen === expected.fy2024CarryoverYen &&
    totals.unusedYen === expected.fy2024UnusedYen
    ? "exact"
    : "mismatch";
}

/**
 * Build the lowest available official breakdown. No synthetic section/subsection rows are
 * created: every component is an actual leaf (目) row from the settlement statement.
 */
export function buildAttentionBreakdown(
  item: ExecutionAttentionItem,
  scanRecords: readonly ScanRecord[],
  comparisons: readonly ComparisonAmountsForBreakdown[],
): AttentionBreakdown {
  const leaves = scanRecords.filter(isLeafExecutionRecord);
  const comparison = item.comparison == null
    ? null
    : comparisons.find((entry) => entry.comparisonId === item.comparison?.comparisonId) ?? null;
  let componentRecords: ScanRecord[];
  if (comparison == null) {
    const own = leaves.find((record) => record.accountKey.key === item.itemId);
    if (own == null) throw new Error(`missing leaf record for ${item.itemId}`);
    componentRecords = [own];
  } else {
    componentRecords = leaves.filter((record) =>
      comparison.fy2024Keys.some((key) => belongsToKey(record, key)),
    );
    if (componentRecords.length === 0) {
      const own = leaves.find((record) => record.accountKey.key === item.itemId);
      if (own == null) throw new Error(`missing leaf record for ${item.itemId}`);
      componentRecords = [own];
    }
  }
  const components = componentRecords
    .map(toComponent)
    .sort((a, b) => a.itemId.localeCompare(b.itemId, "ja"));
  const totals = sumComponents(components);
  return {
    itemId: item.itemId,
    comparisonId: comparison?.comparisonId ?? null,
    comparisonLevel: item.comparison?.matchLevel ?? null,
    components,
    totals,
    reconciliation: reconcile(totals, comparison),
  };
}

export function buildAttentionBreakdowns(
  items: readonly ExecutionAttentionItem[],
  scanRecords: readonly ScanRecord[],
  comparisons: readonly ComparisonAmountsForBreakdown[],
): AttentionBreakdown[] {
  return items.map((item) => buildAttentionBreakdown(item, scanRecords, comparisons));
}
