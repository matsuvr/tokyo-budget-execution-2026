#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Issue #35: 執行方式を分散させた重点レビュー候補を最大20件選定する。
 *
 * - needs-explanation を最優先し（不用額降順）、その後は不用額降順で残り枠を埋める。
 * - 執行方式は科目名パターンと令和6年度予算概要の公式説明文に基づいて割り当てる。
 * - 方式を確認できない候補は水増しせず、unknown として理由を summary へ記録する。
 * - 原因・改善策は本Issueでは記入しない（#34/#36-#39で扱う）。
 */

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const CANDIDATES_PATH = "data/normalized/execution-review/review-candidates.json";
const OUTPUT_PATH = "data/manual/execution-review/selected-policy-reviews.json";

const MAX_SELECTIONS = 20;

type MethodCategory = "direct" | "procurement" | "construction" | "subsidy" | "unknown";

interface MethodRule {
  pattern: RegExp;
  category: Exclude<MethodCategory, "unknown">;
  basis: string;
}

/** 科目名パターンと令和6年度予算概要の説明文による方式割当規則 */
const METHOD_RULES: readonly MethodRule[] = [
  { pattern: /退職手当及年金費|恩給/u, category: "direct", basis: "職員の退職手当等を直接支給する経費（予算概要）" },
  { pattern: /施設整備費|街路整備費|河川海岸費|橋梁整備費|道路維持費|道路補修費|交通安全施設費/u, category: "construction", basis: "施設・道路等の整備・建設を行う経費（予算概要）" },
  { pattern: /補助|交付金|助成/u, category: "subsidy", basis: "補助金・交付金・助成費等の給付経費（予算概要）" },
  { pattern: /業務委託|システム/u, category: "procurement", basis: "業務委託・システム調達経費（予算概要・議案）" },
];

/** 予算現額が大きく、政策的經費ではない対象外科目（#7と同じ趣旨の除外） */
const NON_POLICY_PATTERNS = [/^公債費$/u, /^特別区財政調整会計繰出金/u, /^地方消費税交付金/u, /^予備費$/u, /^他会計支出金$|^諸支出金$|^財産費$|^諸費$/u];

interface CandidateRow {
  comparisonId: string | null;
  mappingId: string;
  granularity: string;
  confidence: string;
  relationType: string;
  fy2024Keys: readonly { chapter: string; section?: string }[];
  amounts: {
    fy2024CurrentBudgetYen: number | null;
    fy2024UnusedYen: number | null;
    fy2026InitialBudgetYen: number | null;
  };
  policyReviewExcluded: boolean;
  exclusionReasonCode: string | null;
}

const file = JSON.parse(await readFile(resolve(ROOT, CANDIDATES_PATH), "utf8")) as {
  records: CandidateRow[];
};

function labelOf(row: CandidateRow): string {
  return row.fy2024Keys.map((key) => key.chapter + (key.section ? `/${key.section}` : "")).join(" + ");
}
function fullLabel(row: CandidateRow): string {
  const parts: string[] = [];
  for (const key of row.fy2024Keys) {
    parts.push(key.section != null ? `${key.chapter} ${key.section}` : key.chapter);
  }
  return parts.join(" + ");
}

function categorize(label: string): { category: MethodCategory; basis: string } {
  for (const rule of METHOD_RULES) {
    if (rule.pattern.test(label)) return { category: rule.category, basis: rule.basis };
  }
  // 款レベルの既知区分（予算概要の所管記載に基づく）
  if (/退職手当/.test(label)) return { category: "direct", basis: "職員給付（予算概要）" };
  return { category: "unknown", basis: "科目名と概要説明から方式を確定できず" };
}

// 入力(review-candidates)は「要説明を先頭に不用額降順」で並んでいるため、
// 対象外(税連動・公債費・予備費等)を除いた上で入力順をそのまま優先順位として使う。
const ordered = file.records.filter((row) => {
  if (row.policyReviewExcluded) return false;
  const label = fullLabel(row);
  return !NON_POLICY_PATTERNS.some((pattern) => pattern.test(label));
});

// 執行方式ごとのカウンタ（各5件を目標）
const TARGET_PER_CATEGORY = 5;
const counters: Record<MethodCategory, number> = {
  direct: 0,
  procurement: 0,
  construction: 0,
  subsidy: 0,
  unknown: 0,
};
const selected: unknown[] = [];
const seenLabels = new Set<string>();

for (const row of ordered) {
  if (selected.length >= MAX_SELECTIONS) break;
  const label = fullLabel(row);
  if (seenLabels.has(label)) continue;
  const { category, basis } = categorize(label);
  if (category !== "unknown" && counters[category] >= TARGET_PER_CATEGORY) continue;
  counters[category] += 1;
  seenLabels.add(label);
  const unusedOku = ((row.amounts.fy2024UnusedYen ?? 0) / 1e8).toFixed(1);
  selected.push({
    comparisonId: row.comparisonId ?? null,
    mappingId: row.mappingId,
    policyTitle: label,
    bureau: null,
    executionMethod: category,
    selectionReason:
      category === "unknown"
        ? `不用額 ${unusedOku} 億円。執行方式は科目名から確定できず。`
        : `不用額 ${unusedOku} 億円。${basis}`,
    evidenceReferences: [
      {
        title: "令和6年度 歳入歳出決算事項別明細書（一般会計）",
        url: "https://www.kaikeikanri.metro.tokyo.lg.jp/documents/d/kaikeikanri/06kessan-2",
        page: null,
        summary: `科目 ${label} の当初予算額・支出済額等。`,
      },
    ],
    amountContext: {
      fy2024CurrentBudgetYen: row.amounts.fy2024CurrentBudgetYen,
      fy2024UnusedYen: row.amounts.fy2024UnusedYen,
      fy2026InitialBudgetYen: row.amounts.fy2026InitialBudgetYen,
    },
  });
}

await mkdir(dirname(resolve(ROOT, OUTPUT_PATH)), { recursive: true });
const output = {
  version: 1,
  generatedFrom: CANDIDATES_PATH,
  criteria: {
    maxSelections: MAX_SELECTIONS,
    perCategoryTarget: TARGET_PER_CATEGORY,
    ordering: "needs-explanation優先→不用額降順（実装上は不用額降順で対象外科目を除く）",
  },
  selections: selected,
  summary: {
    selectedCount: selected.length,
    byCategory: { ...counters },
    shortfallNotes: [
      ...(counters.unknown > 0
        ? [`${counters.unknown}件は公式説明だけでは執行方式を確定できず unknown とした`]
        : []),
    ],
  },
};
await writeFile(resolve(ROOT, OUTPUT_PATH), `${JSON.stringify(output, null, 1)}\n`, "utf8");
console.log(JSON.stringify(output.summary));
