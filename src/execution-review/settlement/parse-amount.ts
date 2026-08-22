/**
 * 決算表の金額文字列を円単位の整数へ変換する純粋関数（Issue #16）。
 * - ゼロと欠損を混同しない: 明示的な「0」は0、空欄はnullを返す。
 * - 「―」「－」等のダッシュは決算表におけるゼロ表現として0へ正規化する。
 * - 括弧付き注記（例: "1,234（注2）"）は括弧部分を除去したうえで数値化する。
 * - 不正な文字（英字混入等）は黙って0にせず例外を投げる。
 */

export type AmountUnit = "yen" | "thousand-yen";

export interface ParseAmountOptions {
  /** 入力の単位。既定値は "yen"。 */
  unit?: AmountUnit;
}

/** 全角数字を半角へ置き換えるための対応表。 */
const FULL_WIDTH_DIGITS = "０１２３４５６７８９";
/** 決算表でゼロを表すダッシュ系記号。 */
const DASH_PATTERN = /^[\p{Pd}ー―─－﹣]*$/u;
const THOUSAND_YEN = 1_000;

function toHalfWidth(input: string): string {
  let result = "";
  for (const character of input) {
    const digitIndex = FULL_WIDTH_DIGITS.indexOf(character);
    result += digitIndex >= 0 ? String(digitIndex) : character;
  }
  return result;
}

export function parseAmountYen(
  input: string | null | undefined,
  options: ParseAmountOptions = {},
): number | null {
  if (input == null) return null;

  // 括弧付き注記の除去（半角・全角）。
  let text = toHalfWidth(input)
    .replace(/\([^)]*\)/g, "")
    .replace(/（[^）]*）/g, "");
  // 半角・全角空白の除去。
  text = text.replace(/\s+/gu, "");

  // 空欄は欠損（0ではない）。
  if (text.length === 0) return null;

  // ダッシュのみは原本上のゼロ表現。
  if (DASH_PATTERN.test(text)) return 0;

  // 負数: 「△」接頭辞のみを負数とみなす。
  // 後置の「△」は本来次の列の符号であるため、この関数ではエラーとして扱う
  // （normalizeTrailingNegativeSigns を通していれば発生しない）。
  let sign = 1;
  if (text.startsWith("△")) {
    sign = -1;
    text = text.slice(1);
  } else if (/\s*△$/u.test(text) || text.endsWith("△")) {
    throw new SyntaxError(`後置△は次の列の符号です（normalizeTrailingNegativeSignsを使ってください）: ${JSON.stringify(input)}`);
  }

  // カンマ区切りの検証: カンマがある場合は3桁区切りであること。
  if (text.includes(",") && !/^\d{1,3}(,\d{3})+$/.test(text)) {
    throw new SyntaxError(`金額として解釈できない文字列です: ${JSON.stringify(input)}`);
  }
  const digitsOnly = text.replaceAll(",", "");
  if (!/^\d+$/.test(digitsOnly)) {
    throw new SyntaxError(`金額として解釈できない文字列です: ${JSON.stringify(input)}`);
  }

  const magnitude = Number(digitsOnly);
  if (!Number.isFinite(magnitude)) {
    throw new RangeError(`数値として大きすぎる文字列です: ${JSON.stringify(input)}`);
  }
  const multiplier = options.unit === "thousand-yen" ? THOUSAND_YEN : 1;
  const yen = sign * magnitude * multiplier;
  if (!Number.isSafeInteger(yen)) {
    throw new RangeError(`安全整数の範囲を超えています: ${JSON.stringify(input)}`);
  }
  return yen;
}
