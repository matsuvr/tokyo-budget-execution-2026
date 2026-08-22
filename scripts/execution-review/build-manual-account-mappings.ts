#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeAccountName } from "../../src/execution-review/mapping/normalize-account-name.ts";
import { validateAccountMappingFile } from "../../src/execution-review/account-mapping.ts";

/**
 * Issue #27: 高額な未対応科目の改称・統合を最大20件だけ手動対応する。
 *
 * - 対象選定: execution-scan の対象外でない行を予算現額降順に走査し、
 *   #26で確定済み（自身または先祖階層）でないものを最大20件まで選ぶ。
 * - 判定は一次資料（令和6年度予算概要 / 議案第1号）の実文書確認（2026-08-22）に基づく。
 * - 根拠ページを確認できたものだけB、範囲が不確実なものはC、
 *   対応不能なものはunmatchedとして理由付きで記録する。
 */

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const SCAN_PATH = "data/normalized/execution-review/fy2024/execution-scan.json";
const EXACT_PATH = "data/manual/execution-review/account-mapping-exact.json";
const OUTPUT_PATH = "data/manual/execution-review/account-mapping-manual.json";

const MAX_TARGETS = 20;
const R6_OVERVIEW_URL = "https://www.zaimu.metro.tokyo.lg.jp/zaisei/yosan/r6/6yosangaiyounituite";
const R8_BILL_URL = "https://www.zaimu1.metro.tokyo.lg.jp/zaisei/yosan/8tousyogian.pdf";

interface CuratedDecision {
  /** 2024側キー（正規化名）。款単独は "K:款名"、項は "款名|項名"。 */
  fy2024Key: string;
  relationType: "renamed" | "merged" | "split" | "discontinued";
  confidence: "B" | "C";
  fy2026Keys: { account: string; chapter: string; section?: string }[];
  granularity: "chapter" | "item";
  evidence: { title: string; url: string; page: number | null }[];
  note: string;
}

/** 実文書検索で根拠ページを確認済みの手動対応表（2026-08-22確認）。 */
const CURATED_DECISIONS: CuratedDecision[] = [
  {
    fy2024Key: "K:生活文化スポーツ費",
    relationType: "renamed",
    confidence: "B",
    fy2026Keys: [{ account: "一般会計", chapter: "04:生活文化費" }],
    granularity: "chapter",
    evidence: [
      { title: "令和6年度予算概要 第1一般会計", url: R6_OVERVIEW_URL, page: 8 },
      { title: "議案第1号 令和8年度東京都一般会計予算", url: R8_BILL_URL, page: 12 },
    ],
    note: "第4款の改称（生活文化スポーツ費→生活文化費）。範囲は同一。",
  },
  {
    fy2024Key: "K:警察費",
    relationType: "renamed",
    confidence: "B",
    fy2026Keys: [{ account: "一般会計", chapter: "14:警察費" }],
    granularity: "chapter",
    evidence: [
      { title: "令和6年度予算概要 第1一般会計", url: R6_OVERVIEW_URL, page: 23 },
      { title: "議案第1号 令和8年度東京都一般会計予算", url: R8_BILL_URL, page: 16 },
    ],
    note: "名称・範囲とも変更なし。決算明細書側の当初予算額が未抽出のためA確定できず、本表でB対応とする。",
  },
  {
    fy2024Key: "K:土木費",
    relationType: "renamed",
    confidence: "B",
    fy2026Keys: [{ account: "一般会計", chapter: "10:土木費" }],
    granularity: "chapter",
    evidence: [
      { title: "令和6年度予算概要 第1一般会計", url: R6_OVERVIEW_URL, page: 18 },
      { title: "議案第1号 令和8年度東京都一般会計予算", url: R8_BILL_URL, page: 13 },
    ],
    note: "名称・範囲とも変更なし。決算明細書側の当初予算額が未抽出のためA確定できず、本表でB対応とする。",
  },
  {
    fy2024Key: "スタートアップ・国際金融都市戦略費|スタートアップ・国際金融都市戦略費",
    relationType: "renamed",
    confidence: "B",
    fy2026Keys: [
      { account: "一般会計", chapter: "09:産業労働費", section: "07:スタートアップ戦略推進費" },
    ],
    granularity: "item",
    evidence: [
      { title: "令和6年度予算概要 第1一般会計", url: R6_OVERVIEW_URL, page: 6 },
      { title: "議案第1号 令和8年度東京都一般会計予算", url: R8_BILL_URL, page: 14 },
    ],
    note: "総務費から産業労働費へ移管のうえ改称（スタートアップ・国際金融都市戦略費→スタートアップ戦略推進費）。",
  },
];

interface ScanRecord {
  accountKey: { chapter: string; section: string; item: string; key: string };
  currentBudgetYen: number;
  policyReview: { excluded: boolean };
}
interface ExactMapping {
  fy2024: { chapterRaw: string; sectionRaw: string | null };
}

function stripCode(value: string): string {
  return normalizeAccountName(value.replace(/^[0-9]{1,2}:/u, ""));
}

async function main(): Promise<void> {
  const scan = JSON.parse(await readFile(resolve(ROOT, SCAN_PATH), "utf8")) as {
    records: ScanRecord[];
  };
  const exact = JSON.parse(await readFile(resolve(ROOT, EXACT_PATH), "utf8")) as {
    mappings: ExactMapping[];
  };

  const confirmed = new Set<string>();
  for (const mapping of exact.mappings) {
    const chapter = stripCode(mapping.fy2024.chapterRaw);
    const section =
      mapping.fy2024.sectionRaw != null ? stripCode(mapping.fy2024.sectionRaw) : null;
    confirmed.add(section != null ? `${chapter}|${section}` : `K:${chapter}`);
  }

  const targets = scan.records
    .filter((record) => !record.policyReview.excluded)
    .sort((a, b) => b.currentBudgetYen - a.currentBudgetYen)
    .filter((record) => {
      const chapter = stripCode(record.accountKey.chapter);
      const section =
        record.accountKey.section !== "" ? stripCode(record.accountKey.section) : null;
      if (section != null && confirmed.has(`${chapter}|${section}`)) return false;
      if (confirmed.has(`K:${chapter}`)) return false;
      return true;
    })
    .slice(0, MAX_TARGETS);

  const manualMappings: unknown[] = [];
  const covered: {
    rank: number;
    key: string;
    currentBudgetYen: number;
    status: "covered";
    reason: string;
  }[] = [];
  const emittedDecisions = new Set<string>();
  const unresolved: {
    rank: number;
    key: string;
    currentBudgetYen: number;
    status: "unmatched";
    reason: string;
  }[] = [];
  let mappingSeq = 0;
  let rank = 0;

  for (const target of targets) {
    rank += 1;
    const chapter = stripCode(target.accountKey.chapter);
    const section = target.accountKey.section !== "" ? stripCode(target.accountKey.section) : null;
    const key = section != null ? `${chapter}|${section}` : `K:${chapter}`;
    const decision =
      CURATED_DECISIONS.find((entry) => entry.fy2024Key === key) ??
      CURATED_DECISIONS.find((entry) => entry.fy2024Key === `K:${chapter}`);

    if (!decision) {
      // 款レベルの対応が既にある場合は項差異を集計粒度で吸収できる旨を理由に残す
      const parentConfirmed = confirmed.has(`K:${chapter}`);
      unresolved.push({
        rank,
        key: target.accountKey.key,
        currentBudgetYen: target.currentBudgetYen,
        status: "unmatched",
        reason: parentConfirmed
          ? "no-item-level-match-but-chapter-covered"
          : "no-evidence-for-manual-correspondence",
      });
      continue;
    }
    if (emittedDecisions.has(decision.fy2024Key)) {
      // 同一対応は1件にまとめる（削除せずに記録する）
      covered.push({
        rank,
        key: target.accountKey.key,
        currentBudgetYen: target.currentBudgetYen,
        status: "covered",
        reason: `deduplicated-to-${decision.fy2024Key}`,
      });
      continue;
    }
    emittedDecisions.add(decision.fy2024Key);
    mappingSeq += 1;
    manualMappings.push({
      mappingId: `map-manual-${String(mappingSeq).padStart(4, "0")}`,
      fiscalYear2024: [
        {
          account: "一般会計",
          chapter: target.accountKey.chapter,
          ...(section != null && target.accountKey.section !== ""
            ? { section: target.accountKey.section }
            : {}),
        },
      ],
      fiscalYear2026: decision.fy2026Keys.map((entry) => ({
        account: entry.account,
        chapter: entry.chapter,
        ...(entry.section != null ? { section: entry.section } : {}),
      })),
      granularity: decision.granularity,
      confidence: decision.confidence,
      relationType: decision.relationType,
      evidence: decision.evidence[0],
      evidenceList: decision.evidence,
      note: `${decision.note}（予算現額 ${(target.currentBudgetYen / 1e8).toFixed(1)}億円・対象ランク ${rank}位）`,
    });
  }

  await mkdir(dirname(resolve(ROOT, OUTPUT_PATH)), { recursive: true });
  const output = {
    version: 1,
    updatedAt: new Date().toISOString(),
    note: "#27の手動対応。判定は令和6年度予算概要と議案第1号の実文書確認に基づく。対象外行やA確定済み行は含まない。",
    selections: targets.map((target, index) => ({
      rank: index + 1,
      key: target.accountKey.key,
      currentBudgetYen: target.currentBudgetYen,
    })),
    mappings: manualMappings,
    covered,
    unresolved,
    summary: {
      targetCount: targets.length,
      mappedCount: manualMappings.length,
      coveredCount: covered.length,
      unresolvedCount: unresolved.length,
      byConfidence: {
        B: manualMappings.filter((entry) => (entry as { confidence: string }).confidence === "B")
          .length,
        C: manualMappings.filter((entry) => (entry as { confidence: string }).confidence === "C")
          .length,
      },
    },
  };
    // #22の契約（AccountMappingRecord）を満たすことを検証する
  const contractCheck = validateAccountMappingFile({
    version: 1,
    updatedAt: new Date().toISOString(),
    mappings: output.mappings as never[],
  });
  if (!contractCheck.valid) {
    console.error("manual mappings violate #22 schema:", contractCheck.errors);
    process.exit(1);
  }

  await writeFile(resolve(ROOT, OUTPUT_PATH), `${JSON.stringify(output, null, 1)}\n`, "utf8");
  console.log(JSON.stringify({ ...output.summary, contractValid: contractCheck.valid }));
}

await main();
