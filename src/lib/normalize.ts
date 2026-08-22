export function cleanCell(value: string | undefined): string {
  return (value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\u00A0/g, " ")
    .trim();
}

export function normalizeHeader(value: string): string {
  return cleanCell(value)
    .replace(/[　\s]+/g, "")
    .replaceAll("（", "(")
    .replaceAll("）", ")")
    .replaceAll("２", "2")
    .replaceAll("１", "1");
}

export function uniqueHeaders(headers: string[]): string[] {
  const counts = new Map<string, number>();
  return headers.map((header, index) => {
    const base = cleanCell(header) || `column_${index + 1}`;
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
}

export function parseNumber(value: string | undefined): number | null {
  let text = cleanCell(value);
  if (!text || /^(?:-|―|—|－|…|\.\.\.|なし|該当なし)$/u.test(text)) return null;

  let negative = false;
  if (/^[△▲]/u.test(text)) {
    negative = true;
    text = text.slice(1);
  }
  if (/^\(.*\)$/u.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }

  text = text
    .replace(/[,+￥¥円%％\s]/g, "")
    .replaceAll("−", "-")
    .replaceAll("－", "-");

  if (!/^-?\d+(?:\.\d+)?$/u.test(text)) return null;
  const valueNumber = Number(text);
  if (!Number.isFinite(valueNumber)) return null;
  return negative ? -Math.abs(valueNumber) : valueNumber;
}

export function parseJapaneseEraDate(value: string): string | null {
  const text = cleanCell(value).replace(/[　\s]/g, "");
  const match = text.match(/^(令和|平成|昭和)(\d{1,2})年(\d{1,2})月(\d{1,2})日$/u);
  if (!match) return null;
  const eraBase: Record<string, number> = { 令和: 2018, 平成: 1988, 昭和: 1925 };
  const year = eraBase[match[1]] + Number(match[2]);
  const month = Number(match[3]);
  const day = Number(match[4]);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseJapaneseEraMonth(value: string): string | null {
  const text = cleanCell(value).replace(/[　\s]/g, "");
  const match = text.match(/^(令和|平成|昭和)(\d{1,2})年(\d{1,2})月$/u);
  if (!match) return null;
  const eraBase: Record<string, number> = { 令和: 2018, 平成: 1988, 昭和: 1925 };
  const year = eraBase[match[1]] + Number(match[2]);
  const month = Number(match[3]);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export function splitObjectAndSubObject(value: string): [string, string | null] {
  const cleaned = cleanCell(value);
  const parts = cleaned.split(/(?:　+|\s{2,})/u).map(cleanCell).filter(Boolean);
  if (parts.length <= 1) return [cleaned, null];
  return [parts[0], parts.slice(1).join(" / ")];
}

export function shouldCoerceNumber(header: string): boolean {
  const normalized = normalizeHeader(header);
  return (
    normalized === "年度" ||
    normalized.includes("金額") ||
    normalized.includes("予算額") ||
    normalized.includes("決算額") ||
    normalized.includes("比率") ||
    normalized.includes("順序") ||
    normalized.endsWith("値")
  );
}

export function coerceCell(header: string, value: string): string | number | null {
  const cleaned = cleanCell(value);
  if (!cleaned) return null;
  if (shouldCoerceNumber(header)) {
    const parsed = parseNumber(cleaned);
    if (parsed !== null) return parsed;
  }
  return cleaned;
}
