/**
 * 会計科目名の最小限の正規化（Issue #25）。
 * - 類似度・部分一致・LLMは使わない。完全一致判定のための表記揺れ除去のみ。
 * - 対象: 空白（半角・全角）、全角英数、一般的な括弧書きの差。
 * - 正規化前後の名称は呼び出し側で両方保持する。
 */

const FULL_WIDTH_ALNUM = /[０-９Ａ-Ｚａ-ｚ]/g;
const PAREN_SEGMENT = /[(（][^)）]*[)）]/gu;

function toHalfWidthAlnum(text: string): string {
  return text.replace(FULL_WIDTH_ALNUM, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  );
}

/**
 * 科目名を正規化する。
 * - 括弧書きの補足（例: 「福祉費（一部事務）」）を除去する。
 * - 半角・全角空白とタブを除去する。
 * - 全角英数字を半角へ置き換える。
 */
export function normalizeAccountName(name: string): string {
  return toHalfWidthAlnum(name)
    .replace(PAREN_SEGMENT, "")
    .replace(/[\s\u3000]+/gu, "")
    .trim();
}
