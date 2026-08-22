import { budgetContinuationRate, carryoverRate, executionRate, unusedRate } from "../metrics.ts";
import { normalizeAccountName } from "./normalize-account-name.ts";

/**
 * 対応表に基づき2024執行実績と2026予算を接続した比較レコードを構築する純粋関数（Issue #29）。
 * - A/B対応のみを金額比較対象とする（C/unmatchedは合算しない）。
 * - split/mergedは共通粒度の単純合計のみ。按分は行わない。
 * - 2024当初予算と予算現額を混同しない。
 */

export interface ComparisonSideKey {
  account: string;
  chapter: string;
  section?: string;
}

export interface SettlementRow {
  /** "kan" | "kou" | "moku" */
  levelKind: string;
  chapterRaw: string;
  sectionRaw: string;
  currentBudgetYen: number | null;
  spentYen: number | null;
  carryoverYen: number | null;
  unusedYen: number | null;
  initialBudgetYen: number | null;
  sourcePage: number | null;
}

export interface OverviewLine {
  level: "kan" | "kou";
  chapterRaw: string;
  sectionRaw: string | null;
  initialBudgetYen: number | null;
  sourcePage: number | null;
}

export interface BudgetComparisonRecord {
  comparisonId: string;
  mappingId: string;
  confidence: "A" | "B";
  relationType: string;
  granularity: string;
  fy2024Keys: ComparisonSideKey[];
  fy2026Keys: ComparisonSideKey[];
  amounts: {
    fy2024InitialBudgetYen: number | null;
    fy2024CurrentBudgetYen: number | null;
    fy2024SpentYen: number | null;
    fy2024CarryoverYen: number | null;
    fy2024UnusedYen: number | null;
    fy2026InitialBudgetYen: number | null;
  };
  rates: {
    executionRate: number | null;
    carryoverRate: number | null;
    unusedRate: number | null;
    budgetContinuationRate: number | null;
  };
  sources: {
    settlementPages: (number | null)[];
    overviewFile: string;
    fy2026SourceFile: string;
  };
}

function stripCode(value: string): string {
  return normalizeAccountName(value.replace(/^[0-9]{1,2}:/u, ""));
}

interface Indexes {
  /** "kan|正規化款名" / "kou|正規化款名|正規化項名" */
  settlement: Map<string, SettlementRow>;
  overview: Map<string, OverviewLine>;
  fy2026: Map<string, OverviewLine>;
}

function settlementLookup(
  index: Indexes,
  key: ComparisonSideKey,
): SettlementRow | undefined {
  const chapter = stripCode(key.chapter);
  if (key.section != null && key.section !== "") {
    return index.settlement.get(`kou|${chapter}|${stripCode(key.section)}`);
  }
  return index.settlement.get(`kan|${chapter}`);
}

function overviewLookup(index: Indexes, key: ComparisonSideKey): OverviewLine | undefined {
  const chapter = stripCode(key.chapter);
  if (key.section != null && key.section !== "") {
    return index.overview.get(`kou|${chapter}|${stripCode(key.section)}`);
  }
  return index.overview.get(`kan|${chapter}`);
}

function fy2026Lookup(index: Indexes, key: ComparisonSideKey): OverviewLine | undefined {
  const chapter = stripCode(key.chapter);
  if (key.section != null && key.section !== "") {
    return index.fy2026.get(`kou|${chapter}|${stripCode(key.section)}`);
  }
  return index.fy2026.get(`kan|${chapter}`);
}

/** 複数キーの単純合計（欠損はnull維持、全欠損ならnull） */
function sumNullable(values: readonly (number | null)[]): number | null {
  let sawValue = false;
  let sum = 0n;
  for (const value of values) {
    if (value == null) continue;
    sawValue = true;
    sum += BigInt(value);
  }
  return sawValue ? Number(sum) : null;
}

/**
 * 対応表1件から比較レコードを生成する。対応できない側があればnullを返す。
 */
export function buildComparison(
  mappingId: string,
  mapping: {
    confidence: "A" | "B";
    relationType: string;
    granularity: string;
    fy2024Keys: readonly ComparisonSideKey[];
    fy2026Keys: readonly ComparisonSideKey[];
  },
  index: Indexes,
  sequence: number,
): BudgetComparisonRecord | null {
  // 2024決算（明細書）: 同一レベルの行のみを合計する（子階層との二重計上を避ける）
  const expectedLevel = mapping.granularity === "chapter" ? "kan" : "kou";
  const settlementRows: SettlementRow[] = [];
  for (const key of mapping.fy2024Keys) {
    const row = settlementLookup(index, key);
    if (row == null || row.levelKind !== expectedLevel) continue;
    settlementRows.push(row);
  }
  if (settlementRows.length === 0) return null;

  // 2024当初予算（概要）
  const overviewLines: OverviewLine[] = [];
  for (const key of mapping.fy2024Keys) {
    const line = overviewLookup(index, key);
    if (line == null || line.level !== expectedLevel) continue;
    overviewLines.push(line);
  }

  // 2026当初予算（議案）
  const fy2026Lines: OverviewLine[] = [];
  for (const key of mapping.fy2026Keys) {
    const line = fy2026Lookup(index, key);
    if (line == null || line.level !== expectedLevel) continue;
    fy2026Lines.push(line);
  }

  const currentBudgetYen = sumNullable(settlementRows.map((row) => row.currentBudgetYen));
  const spentYen = sumNullable(settlementRows.map((row) => row.spentYen));
  const carryoverYen = sumNullable(settlementRows.map((row) => row.carryoverYen));
  const unusedYen = sumNullable(settlementRows.map((row) => row.unusedYen));
  const fy2024Initial =
    overviewLines.length > 0 ? sumNullable(overviewLines.map((line) => line.initialBudgetYen)) : null;
  const fy2026Initial =
    fy2026Lines.length > 0 ? sumNullable(fy2026Lines.map((line) => line.initialBudgetYen)) : null;

  return {
    comparisonId: `cmp-${String(sequence).padStart(4, "0")}`,
    mappingId,
    confidence: mapping.confidence,
    relationType: mapping.relationType,
    granularity: mapping.granularity,
    fy2024Keys: [...mapping.fy2024Keys],
    fy2026Keys: [...mapping.fy2026Keys],
    amounts: {
      fy2024InitialBudgetYen: fy2024Initial,
      fy2024CurrentBudgetYen: currentBudgetYen,
      fy2024SpentYen: spentYen,
      fy2024CarryoverYen: carryoverYen,
      fy2024UnusedYen: unusedYen,
      fy2026InitialBudgetYen: fy2026Initial,
    },
    rates: {
      executionRate: executionRate(spentYen, currentBudgetYen),
      carryoverRate: carryoverRate(carryoverYen, currentBudgetYen),
      unusedRate: unusedRate(unusedYen, currentBudgetYen),
      budgetContinuationRate:
        budgetContinuationRate(fy2026Initial, fy2024Initial ?? undefined) ?? null,
    },
    sources: {
      settlementPages: settlementRows.map((row) => row.sourcePage),
      overviewFile: "data/raw/execution-review/fy2024/budget/budget-general-account.pdf",
      fy2026SourceFile: "data/raw/execution-review/fy2026/budget/budget-bill.pdf",
    },
  };
}

export function buildIndexes(
  settlementRecords: readonly {
    /** 階層種別。無い場合はaccountKeyの構造から推論する */
    kind?: string;
    accountKey: { chapter: string; section: string; item?: string };
    currentBudgetYen: number;
    spentYen: number;
    carryoverYen: number;
    unusedYen: number;
    initialBudgetYen: number | null;
    sourcePage: number;
  }[],
  overviewFy2024: readonly { level: string; chapter: string; section: string | null; initialBudgetYen: number | null; sourcePage: number | null }[],
  overviewFy2026: readonly { level: string; chapter: string; section: string | null; initialBudgetYen: number | null; sourcePage: number | null }[],
): Indexes {
  const settlement = new Map<string, SettlementRow>();
  for (const record of settlementRecords) {
    const chapter = stripCode(record.accountKey.chapter);
    const section = record.accountKey.section === "" ? null : stripCode(record.accountKey.section);
    const item =
      record.accountKey.item == null || record.accountKey.item === ""
        ? null
        : stripCode(record.accountKey.item);
    // kindが無いデータではキー構造から階層を推論する（項空=款、目有=目）
    const levelKind =
      record.kind ?? (section == null ? "kan" : item == null ? "kou" : "moku");
    const key =
      levelKind === "kan"
        ? `kan|${chapter}`
        : levelKind === "kou"
          ? `kou|${chapter}|${section ?? ""}`
          : `moku|${chapter}|${section ?? ""}|${item ?? ""}`;
    settlement.set(key, {
      levelKind,
      chapterRaw: record.accountKey.chapter,
      sectionRaw: record.accountKey.section,
      currentBudgetYen: record.currentBudgetYen,
      spentYen: record.spentYen,
      carryoverYen: record.carryoverYen,
      unusedYen: record.unusedYen,
      initialBudgetYen: record.initialBudgetYen,
      sourcePage: record.sourcePage,
    });
  }
  function buildOverview(lines: readonly { level: string; chapter: string; section: string | null; initialBudgetYen: number | null; sourcePage: number | null }[]): Map<string, OverviewLine> {
    const map = new Map<string, OverviewLine>();
    for (const line of lines) {
      const chapter = stripCode(line.chapter);
      const key =
        line.level === "kan" || line.section == null
          ? `kan|${chapter}`
          : `kou|${chapter}|${stripCode(line.section)}`;
      map.set(key, {
        level: line.level as "kan" | "kou",
        chapterRaw: line.chapter,
        sectionRaw: line.section,
        initialBudgetYen: line.initialBudgetYen,
        sourcePage: line.sourcePage,
      });
    }
    return map;
  }
  return {
    settlement,
    overview: buildOverview(overviewFy2024),
    fy2026: buildOverview(overviewFy2026),
  };
}
