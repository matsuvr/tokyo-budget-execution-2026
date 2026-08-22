/**
 * 政策執行レビュー対象外の会計科目を判定する純粋関数。
 * - 巨額かつ政策実施能力の比較に適さない項目を除外する。
 * - 完全一致を基本とし、曖昧な部分一致による過剰除外を避ける。
 * - 除外語は一箇所の定数 EXCLUSION_RULES に集約する。
 * - 戻り値は { excluded, reasonCode } で、除外されてもデータから削除せず理由付きで保持できる。
 */

import type { ExecutionAccountKey } from "./types.ts";

/**
 * 除外理由コード。UIや集計で表示する際のキー。
 */
export type ExclusionReasonCode =
  | "public-debt" // 公債費
  | "special-ward-grant" // 特別区交付金・財政調整交付金
  | "local-consumption-tax-settlement" // 地方消費税清算
  | "tax-linked-cost" // 税連動経費
  | "inter-account-transfer" // 会計間繰出・繰入
  | "reserve-fund" // 予備費
  | "repayment-refund" // 償還・返還・法定移転
  | null; // 除外対象外

export interface ExclusionResult {
  excluded: boolean;
  reasonCode: ExclusionReasonCode;
  matchedKeyword: string | null;
}

/**
 * 除外判定ルール。完全一致を基本とする。
 * keyword は款・項・目のいずれかの完全一致で判定する。
 */
interface ExclusionRule {
  keyword: string;
  reasonCode: Exclude<ExclusionReasonCode, null>;
  /** どの階層で判定するか。未指定なら全階層で判定。 */
  field?: "account" | "chapter" | "section" | "item";
}

export const EXCLUSION_RULES: readonly ExclusionRule[] = [
  // 公債費
  { keyword: "公債費", reasonCode: "public-debt" },

  // 特別区交付金関連
  { keyword: "特別区交付金", reasonCode: "special-ward-grant" },
  { keyword: "特別区財政調整交付金", reasonCode: "special-ward-grant" },

  // 地方消費税清算
  { keyword: "地方消費税清算金", reasonCode: "local-consumption-tax-settlement" },
  { keyword: "地方消費税清算費", reasonCode: "local-consumption-tax-settlement" },
  { keyword: "地方消費税清算", reasonCode: "local-consumption-tax-settlement" },

  // 税連動経費
  { keyword: "税連動経費", reasonCode: "tax-linked-cost" },

  // 会計間繰出・繰入
  { keyword: "繰出金", reasonCode: "inter-account-transfer" },
  { keyword: "繰入金", reasonCode: "inter-account-transfer" },
  { keyword: "他会計繰出金", reasonCode: "inter-account-transfer" },
  { keyword: "他会計繰入金", reasonCode: "inter-account-transfer" },

  // 予備費
  { keyword: "予備費", reasonCode: "reserve-fund" },

  // 償還・返還・法定移転
  { keyword: "償還金", reasonCode: "repayment-refund" },
  { keyword: "返還金", reasonCode: "repayment-refund" },
  { keyword: "償還費", reasonCode: "repayment-refund" },
  { keyword: "利子割交付金", reasonCode: "repayment-refund" },
  { keyword: "配当割交付金", reasonCode: "repayment-refund" },
  { keyword: "株式等譲渡所得割交付金", reasonCode: "repayment-refund" },
  { keyword: "法人事業税交付金", reasonCode: "repayment-refund" },
  { keyword: "地方消費税交付金", reasonCode: "repayment-refund" },
  { keyword: "ゴルフ場利用税交付金", reasonCode: "repayment-refund" },
  { keyword: "自動車取得税交付金", reasonCode: "repayment-refund" },
  { keyword: "軽油引取税交付金", reasonCode: "repayment-refund" },
] as const;

/**
 * 完全一致で除外判定する純粋関数。
 * - 入力を変更しない。
 * - 部分一致は行わず、キーワードとフィールドが完全一致した場合のみ除外する。
 */
export function checkExclusion(
  accountKey: Pick<ExecutionAccountKey, "account" | "chapter" | "section" | "item">,
): ExclusionResult {
  const fields: Array<{ value: string; field: ExclusionRule["field"] }> = [
    { value: accountKey.account, field: "account" },
    { value: accountKey.chapter, field: "chapter" },
    { value: accountKey.section, field: "section" },
    { value: accountKey.item, field: "item" },
  ];

  for (const rule of EXCLUSION_RULES) {
    for (const { value, field } of fields) {
      // field指定があるルールはその階層のみで判定、無い場合は全階層で完全一致
      if (rule.field != null && rule.field !== field) continue;
      if (value === rule.keyword) {
        return { excluded: true, reasonCode: rule.reasonCode, matchedKeyword: rule.keyword };
      }
    }
  }

  return { excluded: false, reasonCode: null, matchedKeyword: null };
}

/**
 * 簡易版: 4つの名称を直接渡す場合
 */
export function isExcludedByNames(
  account: string,
  chapter: string,
  section: string,
  item: string,
): ExclusionResult {
  return checkExclusion({ account, chapter, section, item });
}
