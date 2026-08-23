# データ辞書

## 公金支出 `transactions.jsonl`

1行が1支払です。

| フィールド | 型 | 原本対応 | 説明 |
|---|---|---|---|
| `fiscalYear` | `2024 | 2025 | 2026` | 年度 | 会計年度 |
| `sourceMonth` | `string` | 原本ファイル | `YYYY-MM`。出納整理期間も実際の支払月 |
| `sourceFile` | `string` | - | 原本への相対パス |
| `sourceRow` | `number` | - | 原本の1始まり行番号 |
| `paidAt` | `string | null` | 支払日 | ISO 8601 |
| `bureau` | `string` | 局名 | 所管局 |
| `department` | `string` | 部名 | 部 |
| `section` | `string` | 課名 | 課 |
| `account` | `string` | 会計名 | 一般会計・特別会計等 |
| `chapter` | `string` | 款名 | 款 |
| `item` | `string` | 項名 | 項 |
| `object` | `string` | 目名 | 目 |
| `expenseSection` | `string` | 節・細節名 | 節 |
| `expenseSubsection` | `string | null` | 節・細節名 | 細節。分離できない場合は`null` |
| `description` | `string` | 支払内容（件名） | 件名 |
| `amountYen` | `number` | 支払額（円） | 円 |
| `isClosingPeriod` | `boolean` | 原本ファイル | 出納整理期間か |

## 給与関係費 `payroll.json`

通常の支払明細とは別原本です。`records`は月×費目の長形式です。

| フィールド | 型 | 説明 |
|---|---|---|
| `paidMonth` | `string` | `YYYY-MM` |
| `category` | `string` | 報酬、給料、職員手当等、共済費等 |
| `amountYen` | `number` | 円 |

## 予算 `budget/*.json`

各ファイルは `{ dataset, key, title, fiscalYears, columns, recordCount, records }` です。日本語列名と原本単位を維持しています。2025・2026年度だけを抽出しています。

`03_hitoriatari_yosan.json`だけは、原本の年度横持ちを `{年度, 区分, 金額（円）}` の長形式に変換しています。

## 補助金 `subsidies/{year}.jsonl`

| フィールド | 型 | 説明 |
|---|---|---|
| `fiscalYear` | `2025 | 2026` | 年度 |
| `bureauNo`, `bureau` | `string` | 所管局番号・名称 |
| `policyAreaNo`, `policyArea` | `string` | 施策分野番号・名称 |
| `programName` | `string` | 事業名 |
| `subsidyName` | `string` | 補助金名 |
| `summary` | `string` | 概要 |
| `recipientNo`, `recipient` | `string` | 補助対象者番号・名称 |
| `budgetThousandYen` | `number | null` | 千円 |
| `department`, `contact`, `url` | `string` | 問合せ情報 |

## 一般会計決算見込み `closing-estimate/fy2025.json`

2026年7月31日に公表された令和7年度一般会計決算の見込み値を、原本1ページ目から転記したJSONです。金額単位は億円です。`status`は`preliminary`であり、確定した普通会計決算ではありません。当初予算との単純比率は執行率として扱わないでください。

## 集計ファイル

- `by-month.json`: 月別の通常支払、給与、合計
- `by-bureau.json`: 局別の通常支払件数・金額
- `by-account.json`: 会計別
- `by-chapter.json`: 款別

給与は局・款等の配賦情報を持たないため、局別・会計別・款別には加算していません。

## 年度内執行ギャップ `execution-review`

### `execution-attention-items.json`

2024年度一般会計の正式決算における最下位の「目」行を1レコードとして保持します。款・項の集約行は `execution-scan.json` に残りますが、主一覧・主集計には使いません。

| フィールド | 型 | 単位・null | 説明 |
|---|---|---|---|
| `itemId` | `string` | 非null | 原則 `accountKey.key`。同じ入力から決定的 |
| `reviewScope` | `operational | reference-only | uncertain` | 非null | 主一覧、参考表示、区分要確認 |
| `reviewScopeReasonCode` | `string | null` | `null`は明示的な分離理由なし | 参考項目等の理由コード |
| `amounts.currentBudgetYen` | `number` | 円 | 予算現額 |
| `amounts.spentYen` | `number` | 円 | 支出済額 |
| `amounts.carryoverYen` | `number` | 円 | 翌年度繰越額 |
| `amounts.unusedYen` | `number` | 円 | 不用額 |
| `amounts.yearEndUnexecutedYen` | `number` | 円 | `carryoverYen + unusedYen` |
| `rates.yearEndUnexecutedRate` | `number | null` | 0〜1。分母0等は`null` | 年度内未執行額 / 予算現額 |
| `gapComposition` | `string` | 非null | `carryover-dominant`、`unused-dominant`、`balanced`、`unavailable` |
| `attentionFlags` | `string[]` | 空配列可 | 複数同時成立する事実シグナル |
| `comparison` | `object | null` | 比較不能・未確認は`null` | 2026年度予算との任意結合。A/B/Cを保持 |
| `source`, `sourcePage` | `object`, `number | null` | - | 正式決算原本と物理ページ |

`attentionFlags` は総合点ではありません。`material-unexecuted-amount`、`high-unexecuted-rate`、`budget-continues`、`budget-expanded`、`cross-year-comparison-unavailable`を固定順で併記します。

### `execution-attention-details.json`

| フィールド | 型 | 説明 |
|---|---|---|
| `item` | `ExecutionAttentionItem` | 一覧と同じ会計上の事実 |
| `breakdown.components` | `array` | 比較単位に属する実在の2024年度「目」明細。推定した節・細節は作らない |
| `breakdown.reconciliation` | `exact | mismatch | not-applicable` | 比較側集計と構成明細合計の照合結果 |
| `paymentEvidence.matchGranularity` | `item | section | chapter | none` | 公金支出を実際に照合した粒度 |
| `paymentEvidence.expenseBreakdown` | `array` | 公金支出の節・細節の全内訳 |
| `officialExplanation.status` | `confirmed | not-found | not-reviewed | not-applicable` | 未調査と調査済み未確認を区別 |
| `investigationQuestions` | `array` | 原因断定ではなく追加確認用の疑問文 |

公金支出の `totalAmountYen` は正式決算の `spentYen` と別系列であり、置換・補正には使いません。

### `attention-bureau-summary.json`

款を局・分野の表示単位とし、`reviewScope`ごとに別集計します。率は行率の平均ではなく、合計金額から再計算します。`reference-only`と`uncertain`を`operational`へ混ぜません。
