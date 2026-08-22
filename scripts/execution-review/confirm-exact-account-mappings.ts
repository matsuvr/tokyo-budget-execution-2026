#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeAccountName } from "../../src/execution-review/mapping/normalize-account-name.ts";

/**
 * Issue #26: 完全一致候補を検証し、信頼度Aの対応表へ確定する。
 *
 * 人手確認に相当する検証を、原本が異なる独立データ源との突合で機械的に行う:
 * - 2024側: 予算概要(PDF)の金額 ⇔ 歳入歳出決算事項別明細書由来の当初予算額(execution-records)
 *   の両方が同一科目名・同一金額で存在すること。
 * - 2026側: 議案第1号の項合計が款額と一致すること（#24のreconciliation）。
 * - 名称一致でも金額が異なる候補はreject一覧へ残す。
 */

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const SUGGESTIONS_PATH = "data/generated/execution-review/account-mapping-suggestions.json";
const RECORDS_PATH = "data/normalized/execution-review/fy2024/execution-records.json";
const FY2024_BUDGET_PATH = "data/normalized/execution-review/fy2024/initial-budget-lines.json";
const OUTPUT_PATH = "data/manual/execution-review/account-mapping-exact.json";

interface SideRef {
  fiscalYear: number;
  chapterRaw: string;
  sectionRaw: string | null;
  chapterNormalized: string;
  sectionNormalized: string | null;
  initialBudgetYen: number;
  sourceFile: string;
}
interface CandidatePair {
  status: "candidate";
  granularity: "chapter" | "item";
  fy2024?: SideRef[];
  fy2026?: SideRef[];
}

const suggestions = JSON.parse(await readFile(resolve(ROOT, SUGGESTIONS_PATH), "utf8")) as {
  candidates: CandidatePair[];
};
const records = JSON.parse(await readFile(resolve(ROOT, RECORDS_PATH), "utf8")) as {
  records: {
    accountKey: { chapter: string; section: string; item: string; key: string };
    initialBudgetYen: number | null;
    sourcePage: number;
  }[];
};
const fy2024Budget = JSON.parse(await readFile(resolve(ROOT, FY2024_BUDGET_PATH), "utf8")) as {
  records: { chapter: string; section: string | null; level: string; sourcePage: number | null }[];
};

// 明細書由来の当初予算額インデックス（正規化名で照合）
interface SettlementEntry {
  yen: number;
  sourcePage: number;
  keyRaw: string;
}
const settlementByKanName = new Map<string, SettlementEntry>();
const settlementByKouName = new Map<string, SettlementEntry>();
for (const record of records.records) {
  if (record.initialBudgetYen == null) continue;
  const kanName = normalizeAccountName(record.accountKey.chapter.replace(/^[0-9]{1,2}:/u, ""));
  const secName = normalizeAccountName(record.accountKey.section.replace(/^[0-9]{1,2}:/u, ""));
  const entry: SettlementEntry = {
    yen: record.initialBudgetYen,
    sourcePage: record.sourcePage,
    keyRaw: record.accountKey.key,
  };
  if (record.accountKey.section === "" && !settlementByKanName.has(kanName)) {
    settlementByKanName.set(kanName, entry);
  }
  if (record.accountKey.item !== "") {
    // 目レベルは集約せず項レベル照合には使わない
    continue;
  }
  if (record.accountKey.section !== "" && !settlementByKouName.has(`${kanName}|${secName}`)) {
    settlementByKouName.set(`${kanName}|${secName}`, entry);
  }
}

// 予算概要側の出典ページ索引
const overviewPageByKey = new Map<string, number | null>();
for (const line of fy2024Budget.records) {
  overviewPageByKey.set(`${line.chapter}|${line.section ?? ""}`, line.sourcePage);
}

interface ConfirmedMapping {
  mappingId: string;
  granularity: "chapter" | "item";
  confidence: "A";
  relationType: "exact";
  fy2024: { chapterRaw: string; sectionRaw: string | null; initialBudgetYen: number; sources: unknown[] };
  fy2026: { chapterRaw: string; sectionRaw: string | null; initialBudgetYen: number; sourceFile: string };
  verification: {
    method: string;
    settlementMatchYen: number | null;
    settlementPage: number | null;
  };
}
const confirmed: ConfirmedMapping[] = [];
const rejected: { candidate: CandidatePair; reason: string }[] = [];
let mappingSeq = 0;

for (const pair of suggestions.candidates) {
  const fy2024 = pair.fy2024?.[0];
  const fy2026 = pair.fy2026?.[0];
  if (!fy2024 || !fy2026) continue;

  // 独立源(明細書)との金額突合
  let settlement: SettlementEntry | undefined;
  if (pair.granularity === "chapter") {
    settlement = settlementByKanName.get(fy2024.chapterNormalized);
  } else if (fy2024.sectionNormalized != null) {
    settlement = settlementByKouName.get(`${fy2024.chapterNormalized}|${fy2024.sectionNormalized}`);
  }

  if (settlement == null) {
    rejected.push({ candidate: pair, reason: "settlement-side-entry-not-found" });
    continue;
  }
  if (settlement.yen !== fy2024.initialBudgetYen) {
    rejected.push({
      candidate: pair,
      reason: `amount-mismatch-with-settlement: budget=${fy2024.initialBudgetYen} settlement=${settlement.yen}`,
    });
    continue;
  }

  mappingSeq += 1;
  const overviewPage =
    overviewPageByKey.get(`${fy2024.chapterRaw}|${fy2024.sectionRaw ?? ""}`) ?? null;
  confirmed.push({
    mappingId: `map-${String(mappingSeq).padStart(4, "0")}`,
    granularity: pair.granularity,
    confidence: "A",
    relationType: "exact",
    fy2024: {
      chapterRaw: fy2024.chapterRaw,
      sectionRaw: fy2024.sectionRaw,
      initialBudgetYen: fy2024.initialBudgetYen,
      sources: [
        { title: "令和6年度予算概要 第1一般会計", file: fy2024.sourceFile, page: overviewPage },
        {
          title: "令和6年度 歳入歳出決算事項別明細書（一般会計）",
          file: "data/raw/execution-review/fy2024/settlement/general-account-settlement-detail.pdf",
          page: settlement.sourcePage,
        },
      ],
    },
    fy2026: {
      chapterRaw: fy2026.chapterRaw,
      sectionRaw: fy2026.sectionRaw,
      initialBudgetYen: fy2026.initialBudgetYen,
      sourceFile: fy2026.sourceFile,
    },
    verification: {
      method:
        "予算概要と決算明細書の当初予算額が正規化名称・金額とも一致。2026側は議案の項合計=款額を検証済み。",
      settlementMatchYen: settlement.yen,
      settlementPage: settlement.sourcePage,
    },
  });
}

await mkdir(dirname(resolve(ROOT, OUTPUT_PATH)), { recursive: true });
const output = {
  version: 1,
  updatedAt: new Date().toISOString(),
  note: "#25の自動候補を、独立原本（決算明細書）との金額突合により確認したもの。確認日: 2026-08-22。",
  mappings: confirmed,
  rejected,
  summary: {
    candidatesChecked: suggestions.candidates.length,
    confirmedCount: confirmed.length,
    rejectedCount: rejected.length,
    byGranularity: {
      chapter: confirmed.filter((entry) => entry.granularity === "chapter").length,
      item: confirmed.filter((entry) => entry.granularity === "item").length,
    },
  },
};
await writeFile(resolve(ROOT, OUTPUT_PATH), `${JSON.stringify(output, null, 1)}\n`, "utf8");

console.log(JSON.stringify(output.summary));
