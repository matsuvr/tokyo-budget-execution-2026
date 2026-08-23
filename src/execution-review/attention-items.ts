import { buildAttentionFlags } from "./attention-flags.ts";
import { normalizeAccountName } from "./mapping/normalize-account-name.ts";
import { isLeafExecutionRecord, type ScanRecord } from "./settlement/execution-scan.ts";
import type {
  ComparisonSideKey,
  ExecutionAttentionItem,
  MappingConfidence,
  OptionalBudgetComparison,
} from "./types.ts";

export interface BudgetComparisonInput {
  comparisonId: string;
  mappingId: string;
  confidence: MappingConfidence;
  relationType: string;
  granularity: string;
  fy2024Keys: ComparisonSideKey[];
  fy2026Keys: ComparisonSideKey[];
  amounts: {
    fy2024InitialBudgetYen: number | null;
    fy2026InitialBudgetYen: number | null;
  };
  rates: { budgetContinuationRate: number | null };
}

export interface JoinDiagnostic {
  itemId: string;
  code: "ambiguous-comparison";
  comparisonIds: string[];
}

function stripCode(value: string): string {
  return normalizeAccountName(value.replace(/^[0-9]{1,2}[:：]/u, ""));
}

function derivedBureau(record: ScanRecord): string {
  return record.bureau.trim().length > 0 ? record.bureau : stripCode(record.accountKey.chapter);
}

export function toExecutionAttentionItem(record: ScanRecord): ExecutionAttentionItem {
  if (!isLeafExecutionRecord(record)) {
    throw new Error(`attention item must be a leaf settlement row: ${record.accountKey.key}`);
  }
  const comparison = null;
  return {
    itemId: record.accountKey.key,
    fiscalYear: 2024,
    bureau: derivedBureau(record),
    accountKey: { ...record.accountKey },
    executionMethod: record.executionMethod,
    reviewScope: record.reviewScope.scope,
    reviewScopeReasonCode: record.reviewScope.reasonCode,
    reviewScopeMatchedKeyword: record.reviewScope.matchedKeyword,
    amounts: {
      initialBudgetYen: record.initialBudgetYen,
      currentBudgetYen: record.currentBudgetYen,
      spentYen: record.spentYen,
      carryoverYen: record.carryoverYen,
      unusedYen: record.unusedYen,
      yearEndUnexecutedYen: record.yearEndUnexecuted.amountYen,
    },
    rates: {
      executionRate: record.rates.executionRate,
      carryoverRate: record.rates.carryoverRate,
      unusedRate: record.rates.unusedRate,
      yearEndUnexecutedRate: record.yearEndUnexecuted.rate,
    },
    gapComposition: record.yearEndUnexecuted.composition,
    attentionFlags: buildAttentionFlags({
      yearEndUnexecutedYen: record.yearEndUnexecuted.amountYen,
      yearEndUnexecutedRate: record.yearEndUnexecuted.rate,
      comparison,
    }),
    comparison,
    sourcePage: record.sourcePage,
    source: { ...record.source },
  };
}

export function buildExecutionAttentionItems(records: readonly ScanRecord[]): ExecutionAttentionItem[] {
  const items = records.filter(isLeafExecutionRecord).map(toExecutionAttentionItem);
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.itemId)) throw new Error(`duplicate attention item id: ${item.itemId}`);
    seen.add(item.itemId);
  }
  return items.sort((a, b) => a.itemId.localeCompare(b.itemId, "ja"));
}

function matchSpecificity(item: ExecutionAttentionItem, key: ComparisonSideKey): 0 | 1 | 2 {
  if (stripCode(item.accountKey.account) !== stripCode(key.account)) return 0;
  if (stripCode(item.accountKey.chapter) !== stripCode(key.chapter)) return 0;
  if (key.section != null && key.section.trim().length > 0) {
    return stripCode(item.accountKey.section) === stripCode(key.section) ? 2 : 0;
  }
  return 1;
}

function toOptionalComparison(comparison: BudgetComparisonInput, specificity: 1 | 2): OptionalBudgetComparison {
  return {
    comparisonId: comparison.comparisonId,
    mappingId: comparison.mappingId,
    confidence: comparison.confidence,
    relationType: comparison.relationType,
    granularity: comparison.granularity,
    matchLevel: specificity === 2 ? "section" : "chapter",
    fy2024Keys: comparison.fy2024Keys.map((key) => ({ ...key })),
    fy2026Keys: comparison.fy2026Keys.map((key) => ({ ...key })),
    fy2024InitialBudgetYen: comparison.amounts.fy2024InitialBudgetYen,
    fy2026InitialBudgetYen: comparison.amounts.fy2026InitialBudgetYen,
    budgetContinuationRate: comparison.rates.budgetContinuationRate,
  };
}

/** Section matches beat chapter matches; equal-specificity ambiguity remains comparison:null. */
export function attachBudgetComparisons(
  items: readonly ExecutionAttentionItem[],
  comparisons: readonly BudgetComparisonInput[],
  onDiagnostic?: (diagnostic: JoinDiagnostic) => void,
): ExecutionAttentionItem[] {
  return items.map((item) => {
    const matches: { comparison: BudgetComparisonInput; specificity: 1 | 2 }[] = [];
    for (const comparison of comparisons) {
      let best: 0 | 1 | 2 = 0;
      for (const key of comparison.fy2024Keys) best = Math.max(best, matchSpecificity(item, key)) as 0 | 1 | 2;
      if (best > 0) matches.push({ comparison, specificity: best as 1 | 2 });
    }
    const maxSpecificity = matches.reduce<0 | 1 | 2>((max, match) => Math.max(max, match.specificity) as 0 | 1 | 2, 0);
    const bestMatches = matches.filter((match) => match.specificity === maxSpecificity);
    let comparison: OptionalBudgetComparison | null = null;
    if (bestMatches.length === 1) {
      comparison = toOptionalComparison(bestMatches[0].comparison, bestMatches[0].specificity);
    } else if (bestMatches.length > 1) {
      onDiagnostic?.({
        itemId: item.itemId,
        code: "ambiguous-comparison",
        comparisonIds: bestMatches.map((match) => match.comparison.comparisonId).sort(),
      });
    }
    return {
      ...item,
      comparison,
      attentionFlags: buildAttentionFlags({
        yearEndUnexecutedYen: item.amounts.yearEndUnexecutedYen,
        yearEndUnexecutedRate: item.rates.yearEndUnexecutedRate,
        comparison,
      }),
    };
  });
}
