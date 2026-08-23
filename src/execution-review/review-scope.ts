import { checkExclusion, type ExclusionReasonCode } from "./exclusions.ts";
import type { ExecutionAccountKey, ExecutionMethod } from "./types.ts";

export type ReviewScope = "operational" | "reference-only" | "uncertain";

export type ReviewScopeReasonCode =
  | Exclude<ExclusionReasonCode, null>
  | "statutory-transfer"
  | "personnel-accounting-adjustment"
  | "retirement-benefit-adjustment"
  | "malformed-account-key"
  | null;

export interface ReviewScopeResult {
  scope: ReviewScope;
  reasonCode: ReviewScopeReasonCode;
  matchedKeyword: string | null;
}

function levelName(value: string): string {
  const separator = value.indexOf(":");
  return (separator >= 0 ? value.slice(separator + 1) : value).replace(/\s+/gu, "").trim();
}

/**
 * 東京都2024年度一般会計の実データで確認した退職・恩給系の項名。
 * この項に属する全ての目を、行政サービス実施能力の主比較から分離する。
 */
export const RETIREMENT_REFERENCE_SECTION_NAMES = new Set(["退職手当及年金費"]);

/** Exact-name rules only. Stable-key overrides can be added after a human check. */
export const RETIREMENT_REFERENCE_NAMES = new Set([
  "退職手当",
  "退職給与",
  "退職給与費",
  "退職給付",
  "退職給付費",
  "退職手当引当金",
  "退職給付引当金",
  // 2024年度正式決算の実データで確認した目名
  "退職費",
  "恩給費",
]);

export const PERSONNEL_ADJUSTMENT_REFERENCE_NAMES = new Set([
  "給与改定等調整額",
  "人件費調整額",
]);

export const REVIEW_SCOPE_STABLE_KEY_OVERRIDES: Readonly<Record<string, ReviewScopeResult>> = {};

export function classifyReviewScope(input: {
  accountKey: ExecutionAccountKey;
  executionMethod: ExecutionMethod;
}): ReviewScopeResult {
  const override = REVIEW_SCOPE_STABLE_KEY_OVERRIDES[input.accountKey.key];
  if (override != null) return { ...override };

  if (input.accountKey.account.trim().length === 0 || input.accountKey.chapter.trim().length === 0) {
    return { scope: "uncertain", reasonCode: "malformed-account-key", matchedKeyword: null };
  }

  const names = {
    account: levelName(input.accountKey.account),
    chapter: levelName(input.accountKey.chapter),
    section: levelName(input.accountKey.section),
    item: levelName(input.accountKey.item),
  };
  const exclusion = checkExclusion(names);
  if (exclusion.excluded) {
    return {
      scope: "reference-only",
      reasonCode: exclusion.reasonCode,
      matchedKeyword: exclusion.matchedKeyword,
    };
  }

  if (input.executionMethod === "statutory-transfer") {
    return {
      scope: "reference-only",
      reasonCode: "statutory-transfer",
      matchedKeyword: "statutory-transfer",
    };
  }

  if (RETIREMENT_REFERENCE_SECTION_NAMES.has(names.section)) {
    return {
      scope: "reference-only",
      reasonCode: "retirement-benefit-adjustment",
      matchedKeyword: names.section,
    };
  }

  for (const name of Object.values(names)) {
    if (RETIREMENT_REFERENCE_NAMES.has(name)) {
      return {
        scope: "reference-only",
        reasonCode: "retirement-benefit-adjustment",
        matchedKeyword: name,
      };
    }
    if (PERSONNEL_ADJUSTMENT_REFERENCE_NAMES.has(name)) {
      return {
        scope: "reference-only",
        reasonCode: "personnel-accounting-adjustment",
        matchedKeyword: name,
      };
    }
  }

  // executionMethod=unknown is common in the source data. It remains an explicit
  // attribute but does not hide an otherwise operational accounting line.
  return { scope: "operational", reasonCode: null, matchedKeyword: null };
}
