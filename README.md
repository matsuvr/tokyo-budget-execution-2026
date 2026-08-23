# 東京予算・執行データ 2026

東京都の予算、正式決算、公金支出、給与関係費、補助金を、TypeScriptから扱いやすいUTF-8 JSON/JSONLへ正規化したデータパッケージです。大容量データはCloudflare Workersへ直接バンドルせず、R2へ配置してAPI配信します。

## 収録データ

- 2025・2026年度の当初予算
- 2024〜2026年度の公金支出・給与関係費
- 2025・2026年度の補助金
- 2024年度一般会計の正式決算
- 2024年度決算と2026年度当初予算の対応表
- 2024年度の主要施策、公金支出、2026年度主要政策等の東京都公式資料

原本のURL、取得状態、ファイルサイズ、SHA-256は `data/manifest.json` を正とします。

## 予算は付いた。年度内にどこまで実施できたか

この画面の主な問いは、次のとおりです。

> 行政が必要性を認識して予算を手当てした項目のうち、年度内に支出・実施まで至らなかった規模はどの程度か。2026年度にも予算が継続・増額されている場合、実施体制、調達、工程、制度、申請処理等について何を追加確認すべきか。

インフレ局面での単純な支出削減や「無駄探し」を目的とはしません。正式決算で確認できる事実と、追加で確認すべき問いを分けて提示し、政策上の判断は利用者に委ねます。

### 主指標

```text
年度内未執行額 = 翌年度繰越額 + 不用額
年度内未執行率 = 年度内未執行額 / 予算現額
```

年度内未執行額は、無駄、人手不足、政策失敗を直接証明しません。繰越と不用は会計上の意味が異なるため、合計を主指標にしつつ、内訳を常に別々に表示します。

### 表示母集団

2024年度一般会計の正式決算に含まれる最下位の明細、すなわち「目」の行を主一覧・主集計の母集団とします。決算PDFには款・項・目の集約行が併存するため、全階層を単純合計すると二重・三重計上になります。款・項の行は照合用データとして保持しますが、主合計には使いません。

2026年度予算との対応は任意情報です。対応できない項目も2024年度の金額、会計・款・項・目、原本資料、ページ、詳細を表示します。

### Review scope

各明細を次の3区分で保持します。いずれの行もデータから削除しません。

- `operational`: 行政サービス・事業。主一覧・主合計の対象
- `reference-only`: 公債費、法定移転、会計間移転、予備費、退職手当・退職給付等の会計・制度上の参考項目
- `uncertain`: 会計科目キー等に問題があり区分確認が必要な項目

`executionMethod: unknown` は執行方式未確認を意味します。これだけを理由に主一覧から除外しません。

### 原因と確認質問

人手不足、入札不調、工期、制度要件等は、東京都公式資料に明記された場合だけ「確認済み理由」として表示します。

個別の公式資料レビューをしていない項目は `not-reviewed`、調査したが確認できなかった項目は `not-found` とし、両者を区別します。根拠がない場合は、執行方式に応じた疑問形の「追加で確認したい問い」を別区画に表示します。

### ブレイクダウン

各項目の詳細では、次を別々に確認できます。

1. 正式決算の会計上の事実
2. 比較単位を構成する2024年度の全「目」明細と原本ページ
3. 公金支出で確認できる支払件名、節、細節
4. 公式資料で確認できた説明
5. 追加で確認したい問い

公金支出の集計額は、正式決算の支出済額を置き換えません。

## 主要生成物

| ファイル | 内容 |
|---|---|
| `data/normalized/execution-review/fy2024/execution-scan.json` | 全決算階層。年度内未執行指標とreview scope付き |
| `data/normalized/execution-review/execution-attention-items.json` | 2024年度の「目」明細一覧。2026年度比較はnullable |
| `data/normalized/execution-review/attention-payment-evidence.json` | 全明細の支払件名、節・細節の補助証拠 |
| `data/normalized/execution-review/execution-attention-details.json` | 構成明細、支払証拠、公式説明、確認質問を統合した詳細 |
| `data/normalized/execution-review/attention-bureau-summary.json` | 款を局・分野としてscope別に集計したサマリー |
| `data/normalized/execution-review/index.json` | 件数、scope別金額、比較可否、生成物パス |
| `data/normalized/execution-review/review-candidates.json` | 旧「要説明候補」互換データ。通常画面の主入力ではない |
| `data/normalized/execution-review/policy-review-details.json` | 既存の重点公式資料レビュー |

## 再生成と検証

Node.js 22.6以降とpnpmを使用します。

```bash
pnpm install
pnpm run prepare:execution-review
pnpm test
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run build:web
```

`prepare:execution-review` は、正式決算の抽出、会計恒等式検証、年度間比較、旧互換生成物、全明細一覧、支払証拠、詳細、局別集計、indexを順に生成し、最後に旧検証と全明細検証の両方を実行します。途中失敗は無視しません。

全明細検証では、少なくとも次を確認します。

- 「目」明細件数とattention items件数
- `予算現額 = 支出済額 + 翌年度繰越額 + 不用額`
- `年度内未執行額 = 翌年度繰越額 + 不用額`
- itemIdの一意性
- 一覧・詳細・支払証拠・構成明細の集合一致
- scope別indexと局別集計の一致
- reference-onlyがoperationalへ混入していないこと
- 比較不能行にも2024年度金額と原本参照があること

## API

| エンドポイント | 内容 |
|---|---|
| `/execution-review` | 新旧メタデータを含むindex |
| `/execution-review/attention-items` | 全2024年度「目」明細 |
| `/execution-review/attention-items/:itemId` | itemId指定の全明細詳細 |
| `/execution-review/attention-bureaus` | scope別の局・分野サマリー |
| `/execution-review/candidates` | 旧要説明候補互換API |
| `/execution-review/bureaus` | 旧局別互換API |
| `/execution-review/items/:reviewId` | 旧重点レビュー詳細API |
| `/manifest` | 原本一覧、URL、SHA-256 |
| `/coverage` | 年度・月・系列ごとの収録範囲 |
| `/budget` | 予算系列一覧 |
| `/expenditure/summary` | 公金支出集計 |
| `/subsidies/summary` | 補助金集計 |
| `/data/*` | R2内データの直接取得 |

## Cloudflare Workers + R2

```bash
cp wrangler.jsonc.example wrangler.jsonc
pnpm exec wrangler r2 bucket create tokyo-budget-execution-2026

# アップロード対象の確認。raw PDFと巨大JSONLは既定対象外
pnpm run upload:r2 -- tokyo-budget-execution-2026 --list
pnpm run upload:r2 -- tokyo-budget-execution-2026

# ローカル表示
pnpm run dev

# 本番反映
pnpm run deploy
```

R2の必須対象には、全明細一覧、支払証拠、詳細、局別サマリー、更新後indexが含まれます。生成物が欠けている場合、アップロードは非0で停止します。

## 2分デモ

1. 冒頭で「2024年度の行政サービス・事業明細数」と年度内未執行額、その繰越・不用内訳を示す。
2. 主一覧が年度内未執行額順であり、不用率だけの順位ではないことを示す。
3. 「2026年度比較未確認」を選び、比較不能でも2024年度明細と原本が表示されることを示す。
4. 詳細を開き、構成明細、公金支出の節・細節、公式説明、確認質問が別区画であることを示す。
5. 参考項目へ切り替え、退職手当・法定移転等が主合計から分離されていることを示す。
6. 局・分野別表示で、能力ランキングではなく金額と件数の分布であることを示す。

## その他のデータ利用

既存の予算、公金支出、補助金、決算比較データは引き続き利用できます。公金支出JSONLはストリーム処理し、大量データを一括でメモリへ載せない設計です。

```ts
import { streamPublicExpenditure } from "./src/local.ts";

const byBureau = new Map<string, number>();
for await (const payment of streamPublicExpenditure(2026)) {
  byBureau.set(payment.bureau, (byBureau.get(payment.bureau) ?? 0) + payment.amountYen);
}
```

2025年度一般会計決算見込みは `data/normalized/closing-estimate/fy2025.json` にあります。見込み値であり、2024年度正式決算と同列の正としては使いません。

## ライセンス

コードはMIT Licenseです。データは東京都の公開原本に由来します。再利用時は `NOTICE.md` と各原本のライセンス・サイトポリシーを確認してください。
