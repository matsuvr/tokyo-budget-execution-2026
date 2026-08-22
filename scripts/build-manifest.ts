import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DataManifest, SourceEntry } from "../src/types.ts";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const generatedAt = new Date().toISOString();

interface SourceDefinition extends Omit<
  SourceEntry,
  "status" | "bytes" | "sha256" | "retrievedAt"
> {
  expectedStatus: SourceEntry["status"];
}

const budgetFiles = [
  "01_sainyu_saishutsu.csv",
  "02_zaiseikibo_ippansaishutsu_suii.csv",
  "03_hitoriatari_yosan.csv",
  "04_seishitsubetsu.csv",
  "05_mokutekibetsu.csv",
  "06_kyuyo_kankeihi.csv",
  "07_toshiteki_keihi.csv",
  "08_sainyu_uchiwake.csv",
  "09_tozei_uchiwake.csv",
  "10_tozei_suii.csv",
  "14_kikin_zandaka_suii.csv",
  "15_kikin_tsumitate_torikuzushi_jyokyo.csv",
  "16_tosai_hakkougaku_zandaka_suii.csv",
  "17_kisai_izondo_suii.csv",
  "18_nation_region.csv",
];
const settlementFiles = [
  "01_sainyu.csv",
  "02_tozeiutiwake.csv",
  "03_seisitubetusaishutu.csv",
  "04_mokutekibetusaishutu.csv",
  "05_jissituakajihiritu.csv",
  "06_renketujissituakajihiritu.csv",
  "07_jissitukousaihihiritu.csv",
  "08_shouraihutanhiritu.csv",
  "09_keijoushusihiritu.csv",
  "10_kousaihihutanhiritu.csv",
];

const definitions: SourceDefinition[] = [
  ...budgetFiles.map((file) => ({
    id: `budget-${basename(file, ".csv")}`,
    title: `TOKYO予算見える化ボード: ${file}`,
    category: "budget" as const,
    fiscalYears: [2025, 2026],
    sourceUrl: `https://www.opendata.metro.tokyo.lg.jp/zaimu/R6/${file}`,
    localPath: `data/raw/budget/${file}`,
    expectedStatus: "downloaded" as const,
    notes: "URLのR6表記ではなく、CSV内の年度列を正として利用する。",
  })),
  ...settlementFiles.map((file) => ({
    id: `settlement-${basename(file, ".csv")}`,
    title: `TOKYO決算見える化ボード: ${file}`,
    category: "settlement" as const,
    fiscalYears: [2024],
    sourceUrl: `https://www.opendata.metro.tokyo.lg.jp/zaimu/R7/${file}`,
    localPath: `data/raw/settlement/${file}`,
    expectedStatus: "downloaded" as const,
    notes: "最新確定決算の比較用系列。収録年はファイルごとに異なり、最新は2024年度。",
  })),
  {
    id: "expenditure-2025-04",
    title: "公金支出情報 令和7年度 2025年4月",
    category: "public-expenditure",
    fiscalYears: [2025],
    sourceUrl:
      "https://www.opendata.metro.tokyo.lg.jp/kaikeikanri/op20250813_r7koukinsisyutujouhou_2025_04.csv",
    localPath: "data/raw/public-expenditure/fy2025/2025-04.csv",
    expectedStatus: "downloaded",
  },
  {
    id: "expenditure-2025-05",
    title: "公金支出情報 令和7年度 2025年5月",
    category: "public-expenditure",
    fiscalYears: [2025],
    sourceUrl:
      "https://www.opendata.metro.tokyo.lg.jp/kaikeikanri/op20250813_r7koukinsisyutujouhou_2025_05.csv",
    localPath: "data/raw/public-expenditure/fy2025/2025-05.csv",
    expectedStatus: "downloaded",
  },
  {
    id: "expenditure-2025-06",
    title: "公金支出情報 令和7年度 2025年6月",
    category: "public-expenditure",
    fiscalYears: [2025],
    sourceUrl:
      "https://www.opendata.metro.tokyo.lg.jp/kaikeikanri/op20250813_r7koukinsisyutujouhou_2025_06.csv",
    localPath: "data/raw/public-expenditure/fy2025/2025-06.csv",
    expectedStatus: "downloaded",
  },
  {
    id: "expenditure-2025-07",
    title: "公金支出情報 令和7年度 2025年7月",
    category: "public-expenditure",
    fiscalYears: [2025],
    sourceUrl:
      "https://www.opendata.metro.tokyo.lg.jp/kaikeikanri/op20250903_r7koukinsisyutujouhou_2025_07.csv",
    localPath: "data/raw/public-expenditure/fy2025/2025-07.csv",
    expectedStatus: "downloaded",
  },
  {
    id: "expenditure-2025-08",
    title: "公金支出情報 令和7年度 2025年8月",
    category: "public-expenditure",
    fiscalYears: [2025],
    sourceUrl:
      "https://www.opendata.metro.tokyo.lg.jp/kaikeikanri/op202501002_r7koukinsisyutujouhou_2025_08.csv",
    localPath: "data/raw/public-expenditure/fy2025/2025-08.csv",
    expectedStatus: "downloaded",
    notes: "ファイル名の日付部分は東京都カタログ掲載値をそのまま使用。",
  },
  {
    id: "expenditure-2025-09",
    title: "公金支出情報 令和7年度 2025年9月",
    category: "public-expenditure",
    fiscalYears: [2025],
    sourceUrl:
      "https://www.opendata.metro.tokyo.lg.jp/kaikeikanri/op20251114_r7koukinsisyutujouhou_2025_09.csv",
    localPath: "data/raw/public-expenditure/fy2025/2025-09.csv",
    expectedStatus: "downloaded",
  },
  {
    id: "expenditure-2025-10",
    title: "公金支出情報 令和7年度 2025年10月",
    category: "public-expenditure",
    fiscalYears: [2025],
    sourceUrl:
      "https://www.opendata.metro.tokyo.lg.jp/kaikeikanri/op20251128_r7koukinsisyutujouhou_2025_10.csv",
    localPath: "data/raw/public-expenditure/fy2025/2025-10.csv",
    expectedStatus: "downloaded",
  },
  {
    id: "expenditure-2025-11",
    title: "公金支出情報 令和7年度 2025年11月",
    category: "public-expenditure",
    fiscalYears: [2025],
    sourceUrl:
      "https://www.opendata.metro.tokyo.lg.jp/kaikeikanri/op20251226_r7koukinsisyutujouhou_2025_11.csv",
    localPath: "data/raw/public-expenditure/fy2025/2025-11.csv",
    expectedStatus: "downloaded",
  },
  {
    id: "expenditure-2025-12",
    title: "公金支出情報 令和7年度 2025年12月",
    category: "public-expenditure",
    fiscalYears: [2025],
    sourceUrl:
      "https://www.opendata.metro.tokyo.lg.jp/kaikeikanri/op20260130_r7koukinsisyutujouhou_2025_12.csv",
    localPath: "data/raw/public-expenditure/fy2025/2025-12.csv",
    expectedStatus: "downloaded",
  },
  {
    id: "expenditure-2026-01-fy2025",
    title: "公金支出情報 令和7年度 2026年1月",
    category: "public-expenditure",
    fiscalYears: [2025],
    sourceUrl:
      "https://www.opendata.metro.tokyo.lg.jp/kaikeikanri/op20260227_r7koukinsisyutujouhou_2026_1.csv",
    localPath: "data/raw/public-expenditure/fy2025/2026-01.csv",
    expectedStatus: "downloaded",
  },
  {
    id: "expenditure-payroll-fy2025",
    title: "公金支出情報 令和7年度 給与関係費等",
    category: "public-expenditure",
    fiscalYears: [2025],
    sourceUrl:
      "https://www.opendata.metro.tokyo.lg.jp/kaikeikanri/op20260227_r7koukinsisyutujouhou_kyuyokankei.csv",
    localPath: "data/raw/public-expenditure/fy2025/payroll.csv",
    expectedStatus: "downloaded",
  },
  {
    id: "subsidies-2025",
    title: "TOKYO補助金サーチ 2025年補助金一覧",
    category: "subsidy",
    fiscalYears: [2025],
    sourceUrl: "https://www.opendata.metro.tokyo.lg.jp/zaimu/hojokin2025.csv",
    localPath: "data/raw/subsidies/hojokin2025.csv",
    expectedStatus: "downloaded",
  },
  {
    id: "subsidies-2026",
    title: "TOKYO補助金サーチ 2026年補助金一覧",
    category: "subsidy",
    fiscalYears: [2026],
    sourceUrl: "https://www.opendata.metro.tokyo.lg.jp/zaimu/hojokin2026-2.csv",
    localPath: "data/raw/subsidies/hojokin2026.csv",
    expectedStatus: "downloaded",
  },
  {
    id: "catalog-relevant-api-list",
    title: "東京都オープンデータAPI一覧（財政関係抽出）",
    category: "catalog",
    fiscalYears: [2025],
    sourceUrl:
      "https://data.storage.data.metro.tokyo.lg.jp/digitalservice/130001_tokyo_opendata_api_list.csv",
    localPath: "data/raw/catalog/relevant-api-catalog.csv",
    expectedStatus: "downloaded",
    notes: "2025-02-25時点のAPI一覧から財政関連行を抽出した参照用スナップショット。",
  },
  ...[
    [
      "fy2025-2026-02",
      "令和7年度 2026年2月",
      "0802koukinsisyutsu-xlsx",
      "data/raw/public-expenditure/fy2025/2026-02.xlsx",
    ],
    [
      "fy2025-2026-03",
      "令和7年度 2026年3月",
      "0803koukinsisyutsu-xlsx",
      "data/raw/public-expenditure/fy2025/2026-03.xlsx",
    ],
    [
      "fy2025-closing-04",
      "令和7年度 2026年4月 出納整理期間",
      "0804_suito_koukinsisyutsu-xlsx",
      "data/raw/public-expenditure/fy2025/2026-04-closing.xlsx",
    ],
    [
      "fy2025-closing-05",
      "令和7年度 2026年5月 出納整理期間",
      "0805_suito_koukinsisyutsu-xlsx",
      "data/raw/public-expenditure/fy2025/2026-05-closing.xlsx",
    ],
    [
      "fy2026-2026-04",
      "令和8年度 2026年4月",
      "0804koukinsisyutsu-xlsx",
      "data/raw/public-expenditure/fy2026/2026-04.xlsx",
    ],
    [
      "fy2026-2026-05",
      "令和8年度 2026年5月",
      "0805koukinsisyutsu-xlsx",
      "data/raw/public-expenditure/fy2026/2026-05.xlsx",
    ],
    [
      "fy2026-2026-06",
      "令和8年度 2026年6月",
      "0806koukinsisyutsu-xlsx",
      "data/raw/public-expenditure/fy2026/2026-06.xlsx",
    ],
    [
      "fy2026-payroll",
      "令和8年度 給与関係費等",
      "0806koukinsisyutsukyuuyo-xlsx",
      "data/raw/public-expenditure/fy2026/payroll.xlsx",
    ],
  ].map(([id, title, remoteName, localPath]) => ({
    id: `expenditure-pending-${id}`,
    title: `公金支出情報 ${title}`,
    category: "public-expenditure" as const,
    fiscalYears: id.startsWith("fy2026") ? [2026] : [2025],
    sourceUrl: `https://www.kaikeikanri.metro.tokyo.lg.jp/documents/d/kaikeikanri/${remoteName}`,
    localPath,
    expectedStatus: "pending-upstream-503" as const,
    notes:
      "公式配信サーバーは取得時に断続的な503を返す場合がある。ローカル原本がない場合はfetch:pendingで再取得可能。",
  })),
  ...[
    {
      id: "document-fy2026-budget-proposal-overview",
      title: "令和8年度 東京都予算案の概要",
      fiscalYears: [2026],
      sourceUrl:
        "https://www.zaimu1.metro.tokyo.lg.jp/zaisei/20260130_reiwa8nendo_tokyotoyosanangaiyou/8yosanangaiyou.pdf",
      localPath: "data/raw/documents/fy2026/budget-proposal-overview.pdf",
    },
    {
      id: "document-fy2026-budget-proposal-visual-summary",
      title: "令和8年度 東京都予算案説明資料（図解）",
      fiscalYears: [2026],
      sourceUrl:
        "https://www.zaimu1.metro.tokyo.lg.jp/zaisei/20260130_reiwa8nendo_tokyotoyosanangaiyou/8yosan_gaiyoushiryou.pdf",
      localPath: "data/raw/documents/fy2026/budget-proposal-visual-summary.pdf",
    },
    {
      id: "document-fy2026-major-projects",
      title: "令和8年度 主要事業",
      fiscalYears: [2026],
      sourceUrl:
        "https://www.zaimu1.metro.tokyo.lg.jp/zaisei/20260130_reiwa8nendo_tokyotoyosanangaiyou/8shuyouzigyou.pdf",
      localPath: "data/raw/documents/fy2026/major-projects.pdf",
    },
    {
      id: "document-fy2026-subsidy-execution-review",
      title: "令和8年度予算編成における補助金の執行状況の総点検",
      fiscalYears: [2025, 2026],
      sourceUrl:
        "https://www.zaimu1.metro.tokyo.lg.jp/zaisei/20260130_reiwa8nendo_tokyotoyosanangaiyou/8hojokinnosikkoujoukyou.pdf",
      localPath: "data/raw/documents/fy2026/subsidy-execution-review.pdf",
    },
    {
      id: "document-fy2025-budget-proposal-overview",
      title: "令和7年度 東京都予算案の概要",
      fiscalYears: [2025],
      sourceUrl:
        "https://www.zaimu1.metro.tokyo.lg.jp/zaisei/20250131_reiwa7nendo_tokyotoyosanangaiyou/7yosanangaiyou.pdf",
      localPath: "data/raw/documents/fy2025/budget-proposal-overview.pdf",
    },
    {
      id: "document-fy2025-budget-proposal-visual-summary",
      title: "令和7年度 東京都予算案説明資料（図解）",
      fiscalYears: [2025],
      sourceUrl:
        "https://www.zaimu1.metro.tokyo.lg.jp/zaisei/20250131_reiwa7nendo_tokyotoyosanangaiyou/7yosan_gaiyoushiryou.pdf",
      localPath: "data/raw/documents/fy2025/budget-proposal-visual-summary.pdf",
    },
    {
      id: "document-fy2025-major-projects",
      title: "令和7年度 主要事業",
      fiscalYears: [2025],
      sourceUrl:
        "https://www.zaimu1.metro.tokyo.lg.jp/zaisei/20250131_reiwa7nendo_tokyotoyosanangaiyou/7shuyouzigyou.pdf",
      localPath: "data/raw/documents/fy2025/major-projects.pdf",
    },
    {
      id: "document-fy2025-general-account-closing-estimate",
      title: "令和7年度 一般会計決算（見込み）",
      fiscalYears: [2025],
      sourceUrl:
        "https://www.zaimu.metro.tokyo.lg.jp/documents/d/zaimu/20260731_reiwa7nendo_ippankaikeikessan_mikomi_",
      localPath: "data/raw/documents/fy2025/general-account-closing-estimate.pdf",
      notes: "2026年7月31日公表の見込み値。確定した普通会計決算ではない。",
    },
    ...[
      {
        id: "er-fy2024-settlement-all-accounts-statement",
        title: "令和6年度 東京都各会計歳入歳出決算書",
        remoteName: "06kessan-1",
        fileName: "tokyo-all-accounts-settlement-statement.pdf",
      },
      {
        id: "er-fy2024-settlement-general-account-detail",
        title: "令和6年度 歳入歳出決算事項別明細書（一般会計）",
        remoteName: "06kessan-2",
        fileName: "general-account-settlement-detail.pdf",
        notes: "2024年度一般会計の正式決算数値の正。執行レビューの分母・分子はここから取得する。",
      },
      {
        id: "er-fy2024-settlement-reference-total-overview",
        title: "令和6年度 東京都決算参考書 決算の総括",
        remoteName: "06kessan-6",
        fileName: "settlement-reference-total-overview.pdf",
      },
      {
        id: "er-fy2024-settlement-reference-general-account",
        title: "令和6年度 東京都決算参考書 一般会計",
        remoteName: "06kessan-7",
        fileName: "settlement-reference-general-account.pdf",
      },
    ].map((document) => ({
      id: document.id,
      title: document.title,
      category: "document" as const,
      fiscalYears: [2024] as number[],
      sourceUrl: `https://www.kaikeikanri.metro.tokyo.lg.jp/documents/d/kaikeikanri/${document.remoteName}`,
      localPath: `data/raw/execution-review/fy2024/settlement/${document.fileName}`,
      notes: document.notes,
    })),
  ].map((document) => ({
    ...document,
    category: "document" as const,
    expectedStatus: "downloaded" as const,
  })),
  {
    id: "er-fy2024-major-policy-results",
    title: "令和6年度 主要施策の成果（本編・目次一体）",
    category: "document",
    fiscalYears: [2024],
    sourceUrl:
      "https://www.zaimu.metro.tokyo.lg.jp/documents/d/zaimu/20250924shuyousisakunoseika",
    localPath: "data/raw/execution-review/fy2024/major-policy-results/major-policy-results.pdf",
    expectedStatus: "downloaded",
    notes:
      "政策・事業別の成果と予算現額・決算額を確認できる原本。分割版・別索引は公開されていない。",
  },
  ...[
    { month: "2024-04", remoteName: "0604koukinsisyutsu_1", closing: false },
    { month: "2024-05", remoteName: "0605koukinsisyutsu_1", closing: false },
    { month: "2024-06", remoteName: "0606koukinsisyutsu_1", closing: false },
    { month: "2024-07", remoteName: "0607koukinsisyutsu_1", closing: false },
    { month: "2024-08", remoteName: "0608koukinsisyutsu_1", closing: false },
    { month: "2024-09", remoteName: "0609koukinsisyutsu_1", closing: false },
    { month: "2024-10", remoteName: "0610koukinsisyutsu_1", closing: false },
    { month: "2024-11", remoteName: "0611koukinsisyutsu_1-1", closing: false },
    { month: "2024-12", remoteName: "0612koukinsisyutsu_1", closing: false },
    { month: "2025-01", remoteName: "0701koukinsisyutsu_1", closing: false },
    { month: "2025-02", remoteName: "0702koukinsisyutsu_1", closing: false },
    { month: "2025-03", remoteName: "0703koukinsisyutsu-1-", closing: false },
    { month: "2025-04", remoteName: "0704_suit_koukinsisyutsu-1-", closing: true },
    { month: "2025-05", remoteName: "0705_suit_koukinsisyutsu-1-1", closing: true },
  ].map(({ month, remoteName, closing }) => ({
    id: `er-fy2024-expenditure-${closing ? "closing-" : ""}${month}`,
    title: `公金支出情報 令和6年度 ${month}${closing ? " 出納整理期間" : ""}`,
    category: "public-expenditure" as const,
    fiscalYears: [2024] as number[],
    sourceUrl: `https://www.kaikeikanri.metro.tokyo.lg.jp/documents/d/kaikeikanri/${remoteName}`,
    localPath: `data/raw/public-expenditure/fy2024/${month}${closing ? "-closing" : ""}.xlsx`,
    expectedStatus: "downloaded" as const,
    notes: closing
      ? "出納整理期間分。通常月と区別したうえで補助証拠集計に含めるかを検討する。"
      : undefined,
  })),
  {
    id: "er-fy2024-expenditure-payroll",
    title: "公金支出情報 令和6年度 給与関係費等",
    category: "public-expenditure",
    fiscalYears: [2024],
    sourceUrl:
      "https://www.kaikeikanri.metro.tokyo.lg.jp/documents/d/kaikeikanri/06koukinsisyutsukyuuyo-3-",
    localPath: "data/raw/public-expenditure/fy2024/payroll.xlsx",
    expectedStatus: "downloaded",
  },
  {
    id: "reference-expenditure-fy2024-page",
    title: "東京都会計管理局: 公金支出情報（令和6年度）",
    category: "reference",
    fiscalYears: [2024],
    sourceUrl:
      "https://www.kaikeikanri.metro.tokyo.lg.jp/about/jyouhoukoukai/koukinsisyutsu/06koukaidata",
    expectedStatus: "reference-only",
  },
  {
    id: "er-fy2024-budget-overview-integrated",
    title: "令和6年度予算概要（統合版）",
    category: "document",
    fiscalYears: [2024],
    sourceUrl: "https://www.zaimu.metro.tokyo.lg.jp/documents/d/zaimu/6yosangaiyou1-1",
    localPath: "data/raw/execution-review/fy2024/budget/budget-overview-integrated.pdf",
    expectedStatus: "downloaded",
  },
  {
    id: "er-fy2024-budget-general-account",
    title: "令和6年度予算概要 分割版 第1 一般会計",
    category: "document",
    fiscalYears: [2024],
    sourceUrl: "https://www.zaimu.metro.tokyo.lg.jp/documents/d/zaimu/6yosangaiyou3",
    localPath: "data/raw/execution-review/fy2024/budget/budget-general-account.pdf",
    expectedStatus: "downloaded",
    notes:
      "局・款別の当初予算を確認できる。CSVデータ集はPower BIダッシュボードのみで直接URLが公開されていないため、PDFを正とする。",
  },
  {
    id: "er-fy2026-budget-major-policies",
    title: "令和8年度予算案 主要な施策",
    category: "document",
    fiscalYears: [2026],
    sourceUrl: "https://www.metro.tokyo.lg.jp/documents/d/tosei/20260130_39_04",
    localPath: "data/raw/execution-review/fy2026/budget/major-policies.pdf",
    expectedStatus: "downloaded",
  },
  {
    id: "er-fy2026-budget-counting-table",
    title: "令和8年度予算案 計数表",
    category: "document",
    fiscalYears: [2026],
    sourceUrl: "https://www.metro.tokyo.lg.jp/documents/d/tosei/20260130_39_09",
    localPath: "data/raw/execution-review/fy2026/budget/counting-table.pdf",
    expectedStatus: "downloaded",
    notes: "局・款・項・目レベルの当初予算案計数。既存のbudget-proposal-overview.pdfとは別内容。",
  },
  {
    id: "reference-budget-r6-page",
    title: "東京都財務局: 「令和6年度予算概要」について",
    category: "reference",
    fiscalYears: [2024],
    sourceUrl: "https://www.zaimu.metro.tokyo.lg.jp/zaisei/yosan/r6/6yosangaiyounituite",
    expectedStatus: "reference-only",
  },
  {
    id: "reference-budget-r8-press",
    title: "東京都: 令和8年度東京都予算案の概要（報道発表）",
    category: "reference",
    fiscalYears: [2026],
    sourceUrl: "https://www.metro.tokyo.lg.jp/information/press/2026/01/2026013039",
    expectedStatus: "reference-only",
  },
  {
    id: "reference-budget-dataset",
    title: "東京都オープンデータカタログ: TOKYO予算見える化ボード",
    category: "reference",
    fiscalYears: [2025, 2026],
    sourceUrl: "https://catalog.data.metro.tokyo.lg.jp/dataset/t000004d0000000005",
    expectedStatus: "reference-only",
  },
  {
    id: "reference-settlement-dataset",
    title: "東京都オープンデータカタログ: TOKYO決算見える化ボード",
    category: "reference",
    fiscalYears: [2024],
    sourceUrl: "https://catalog.data.metro.tokyo.lg.jp/dataset/t000004d1800000020",
    expectedStatus: "reference-only",
  },
  {
    id: "reference-expenditure-fy2025",
    title: "東京都会計管理局: 公開データ（令和7年度）",
    category: "reference",
    fiscalYears: [2025],
    sourceUrl:
      "https://www.kaikeikanri.metro.tokyo.lg.jp/about/jyouhoukoukai/koukinsisyutsu/07koukaidata",
    expectedStatus: "reference-only",
  },
  {
    id: "reference-expenditure-fy2026",
    title: "東京都会計管理局: 公開データ（令和8年度）",
    category: "reference",
    fiscalYears: [2026],
    sourceUrl:
      "https://www.kaikeikanri.metro.tokyo.lg.jp/about/jyouhoukoukai/koukinsisyutsu/08koukaidata",
    expectedStatus: "reference-only",
  },
  {
    id: "reference-budget-finance",
    title: "東京都財務局: 予算・財政",
    category: "reference",
    fiscalYears: [2025, 2026],
    sourceUrl: "https://www.zaimu.metro.tokyo.lg.jp/zaisei",
    expectedStatus: "reference-only",
  },
];

async function digest(path: string): Promise<{ bytes: number; sha256: string }> {
  const bytes = await readFile(path);
  const fileStat = await stat(path);
  return {
    bytes: fileStat.size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

const sources: SourceEntry[] = [];
for (const definition of definitions) {
  const { expectedStatus, ...base } = definition;
  if (base.localPath && existsSync(join(ROOT, base.localPath))) {
    const file = await digest(join(ROOT, base.localPath));
    sources.push({
      ...base,
      status: "downloaded",
      bytes: file.bytes,
      sha256: file.sha256,
      retrievedAt: generatedAt,
    });
  } else {
    sources.push({ ...base, status: expectedStatus });
  }
}

const manifest: DataManifest = {
  generatedAt,
  packageName: "tokyo-budget-execution-2026",
  packageVersion: "2026.08.21",
  timezone: "Asia/Tokyo",
  requestedFiscalYears: [2024, 2025, 2026],
  sources,
};
await mkdir(join(ROOT, "data"), { recursive: true });
await mkdir(join(ROOT, "sources"), { recursive: true });
await writeFile(
  join(ROOT, "data", "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

const categoryCounts = new Map<string, number>();
for (const source of sources)
  categoryCounts.set(source.category, (categoryCounts.get(source.category) ?? 0) + 1);
const lines = [
  "# 公式ソース一覧",
  "",
  `生成日時: ${generatedAt}`,
  "",
  "原本URL、ローカル原本、取得状態、SHA-256は `data/manifest.json` を正とします。",
  "",
  "## 収録カテゴリ",
  "",
  ...[...categoryCounts.entries()].map(([category, count]) => `- ${category}: ${count}`),
  "",
  "## 取得待ち",
  "",
  ...sources
    .filter((source) => source.status === "pending-upstream-503")
    .map((source) => `- ${source.title}: ${source.sourceUrl}`),
  "",
  "## 解釈上の注意",
  "",
  "- 予算CSVのURLには `/R6/` が残っていますが、CSV内には2025・2026年度行が含まれます。年度列を正としてください。",
  "- 公金支出明細と予算見える化CSVは分類体系と粒度が異なります。対応表を検証せずに執行率を算出しないでください。",
  "- 令和8年度は年度途中です。公金支出は公開済み月だけを対象とします。",
  "",
];
await writeFile(join(ROOT, "sources", "official-sources.md"), `${lines.join("\n")}\n`, "utf8");
console.log(
  JSON.stringify(
    { sourceCount: sources.length, categoryCounts: Object.fromEntries(categoryCounts) },
    null,
    2,
  ),
);
