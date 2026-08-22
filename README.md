# 東京予算・執行データ 2026

東京都の令和7年度（2025年度）・令和8年度（2026年度）の当初予算、公金支出、給与関係費、補助金と、比較用の確定決算系列を、TypeScriptから扱いやすいUTF-8 JSON/JSONLへ正規化したデータパッケージです。Cloudflare Workersへ巨大データを直接バンドルせず、R2へ配置してAPI配信する構成を同梱しています。

## 収録状況

| 区分 | 収録範囲 | 正規化件数 | 備考 |
|---|---:|---:|---|
| 当初予算 | 2025・2026年度、15系列 | 304行 | 予算見える化ボードCSV。URLの`R6`ではなくCSV内の年度列を採用 |
| 公金支出・令和7年度 | 2025年4月〜2026年3月、出納整理期間4・5月 | 509,389支払 | 月次14原本。出納整理期間は`isClosingPeriod=true` |
| 給与関係費・令和7年度 | 公開CSVに金額がある2025年4月〜2026年1月 | 60カテゴリ月 | 通常支払とは別系列 |
| 公金支出・令和8年度 | 2026年4月〜6月 | 75,247支払 | 月次3原本 |
| 給与関係費・令和8年度 | 2026年4月〜6月 | 18カテゴリ月 | 通常支払とは別系列 |
| 補助金 | 2025・2026年度 | 1,838件 / 1,896件 | 局・施策分野・対象者別集計付き |
| 確定決算比較 | 10系列、最新2024年度 | 5,010行 | 2025年度の最終決算値ではなく比較用 |
| 関連公式資料 | 2025・2026年度 | PDF 8本 | 予算案概要・図解・主要事業、補助金執行状況総点検、2025年度一般会計決算見込み |
| APIカタログ参照 | 財政関連抽出 | 1,497行 | 2025-02-25のAPI一覧スナップショット |

原本ごとのURL、ファイルサイズ、取得状態、SHA-256は [`data/manifest.json`](data/manifest.json) を正とします。検証結果は [`data/verification-report.json`](data/verification-report.json) にあります。

## ディレクトリ

```text
data/
  raw/                         東京都が公開したCSV/XLSX/PDF原本
  normalized/
    budget/                    2025・2026年度に絞った予算JSON
    settlement/                確定決算の比較用JSON
    closing-estimate/          2025年度一般会計決算見込みの転記JSON
    public-expenditure/
      fy2025/transactions.jsonl
      fy2026/transactions.jsonl
      fy20xx/{summary,by-month,by-bureau,by-account,by-chapter}.json
    subsidies/                 年度別JSONLと集計JSON
    catalog/                   財政関連に絞ったAPIカタログJSON
  raw/documents/               年度別の予算案・主要事業等PDF
  manifest.json                原本URL・ハッシュ・取得状態
src/
  worker.ts                    Cloudflare Workers API
  local.ts                     ローカル読込API
  lib/csv.ts                   CP932/UTF-8対応CSVパーサー
  lib/xlsx.ts                  ゼロ依存のXLSX読取器
scripts/
  normalize.ts                 原本から正規化データを再生成
  verify.ts                    件数、合計、ハッシュ、Worker APIを検証
  upload-r2.ts                 R2へのアップロード
```

## ローカルで使う

正規化済みデータを読むだけなら依存パッケージは不要です。Node.js 22.6以降で実行できます。

```bash
node --experimental-strip-types scripts/example-analysis.ts
```

TypeScriptから支払明細をストリーム処理する例です。約58万件を一括でメモリに載せません。

```ts
import { streamPublicExpenditure } from "./src/local.ts";

const byBureau = new Map<string, number>();
for await (const payment of streamPublicExpenditure(2026)) {
  byBureau.set(
    payment.bureau,
    (byBureau.get(payment.bureau) ?? 0) + payment.amountYen,
  );
}
console.log([...byBureau].sort((a, b) => b[1] - a[1]).slice(0, 10));
```

原本から全データを再生成・検証する場合は次を実行します。`filter:catalog`だけは、パッケージ外の完全版API一覧を再取得した場合に `TOKYO_API_LIST_PATH` で指定できます。完全版がない場合は既存の抽出版を維持します。

```bash
pnpm run normalize
pnpm run manifest
pnpm run verify
pnpm run summary
```

## Cloudflare Workers + R2

正規化データは大きいため、Workerのコードバンドルには入れずR2へ置く設計です。

```bash
cp wrangler.jsonc.example wrangler.jsonc
pnpm install
pnpm exec wrangler r2 bucket create tokyo-budget-execution-2026
pnpm run upload:r2 -- tokyo-budget-execution-2026
pnpm run dev
pnpm run deploy
```

`upload:r2`はデフォルトで正規化データ、マニフェスト、検証結果だけをアップロードします。原本もR2へ置く場合は `--include-raw` を追加します。

```bash
pnpm run upload:r2 -- tokyo-budget-execution-2026 --include-raw
```

### API

| エンドポイント | 内容 |
|---|---|
| `/manifest` | 原本一覧、URL、SHA-256 |
| `/coverage` | 年度・月・系列ごとの収録範囲 |
| `/budget` | 予算系列一覧 |
| `/budget/:key?year=2026` | 予算系列。年度指定可 |
| `/settlement` | 決算比較系列一覧 |
| `/settlement/:key` | 決算比較系列 |
| `/expenditure` | 公金支出年度一覧 |
| `/expenditure/summary?year=2026&dimension=month` | 月・局・会計・款別集計 |
| `/subsidies/summary?year=2026` | 補助金集計 |
| `/closing-estimate/2025` | 2025年度一般会計決算見込み |
| `/catalog` | 財政関連APIカタログ抽出版 |
| `/data/*` | R2内のデータを直接取得 |

## 令和7年度決算見込み

`data/normalized/closing-estimate/fy2025.json` に、2026年7月31日公表の一般会計決算見込みを転記しています。歳入9兆2,960億円、歳出9兆819億円、形式収支2,141億円、実質収支0億円です。これは見込み値で、9月公表予定の普通会計決算とは異なります。原本PDFも同梱しています。

## 執行率分析で守るべき境界

このパッケージは、公開された予算と支払実績を同じ場所で扱えるようにしますが、**両者を機械的に割って執行率とはしていません**。

予算見える化CSVは一般会計全体、目的別、性質別などの集計系列です。一方、公金支出明細は会計・款・項・目・節・細節と個別件名を持ちます。さらに、年度途中の執行率には当初予算だけでなく、補正予算、繰越、流用、予備費充当後の「予算現額」が必要です。したがって、実装では次の順序が妥当です。

1. 予算・支出それぞれを独立した事実として集計する。
2. 会計・款・項・目の公式対応表または予算説明書から、対応が確認できた範囲だけ結ぶ。
3. 当初予算ではなく予算現額を作る。
4. 給与関係費と通常支払、出納整理期間を明示的に分離する。
5. 対応不能分を`unknown`として残し、無理に按分しない。

## 文字コードと日付

- 原本CSVにはCP932とUTF-8が混在します。正規化後はUTF-8です。
- 公金支出の和暦日付はISO 8601形式（`YYYY-MM-DD`）へ変換しました。
- 金額は円、予算見える化は原本に従い主に億円、補助金予算額は千円です。単位を統一せず、フィールド名に残しています。
- XLSXは外部ライブラリを使わず、ZIP/Open XMLを読むTypeScript実装で処理しています。

## ライセンス

コードはMIT Licenseです。データは東京都の公開原本に由来します。再利用時は [`NOTICE.md`](NOTICE.md) と各原本のライセンス・サイトポリシーを確認してください。
