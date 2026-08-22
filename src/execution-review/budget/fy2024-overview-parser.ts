import type { PdfTextItem } from "../pdf/extract-text-items.ts";

/**
 * 令和6年度予算概要 第1一般会計（budget-general-account.pdf）から
 * 歳出の款・項ヘッダーと当年度金額（千円）を抽出する純粋関数群（Issue #23）。
 *
 * レイアウト特性（実測）:
 * - 左右2段組（左列 x<300、右列 x≥300）。各列は独立にY帯へクラスタリングする。
 * - 款ヘッダー: 「第１款」「議会費」「（議会局所管）」等が同一Y帯に並ぶ（分割されることもある）。
 * - 項ヘッダー: 「11 その他（…所管）」等、番号で始まる帯。
 * - 金額帯: ヘッダーの下に「６年度 ５年度 比較」「千円×3」を挟み、数値3件が同一帯に並ぶ。
 */

export interface BudgetHeaderHit {
  kind: "kan" | "kou";
  number: string;
  name: string;
  page: number;
  column: "left" | "right";
  y: number;
}

export interface BudgetAmountBand {
  page: number;
  column: "left" | "right";
  y: number;
  /** 当年度（令和6年度）金額トークン。千円単位。 */
  currentYearToken: string;
}


function toHalfWidthDigits(text: string): string {
  return text.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

function columnOf(x: number): "left" | "right" {
  return x < 300 ? "left" : "right";
}

interface ColumnBand {
  y: number;
  column: "left" | "right";
  joined: string;
  items: PdfTextItem[];
}

function buildColumnBands(items: readonly PdfTextItem[]): ColumnBand[] {
  const byColumn: Record<"left" | "right", PdfTextItem[]> = { left: [], right: [] };
  for (const item of items) {
    if (!Number.isFinite(item.x)) continue;
    byColumn[columnOf(item.x)].push(item);
  }
  const bands: ColumnBand[] = [];
  for (const column of ["left", "right"] as const) {
    const sorted = [...byColumn[column]].sort((a, b) => b.y - a.y || a.x - b.x);
    let current: PdfTextItem[] | undefined;
    for (const item of sorted) {
      if (current && current[current.length - 1].y - item.y <= 5) {
        current.push(item);
      } else {
        current = [item];
        bands.push({ y: item.y, column, joined: "", items: current });
      }
    }
  }
  for (const band of bands) {
    band.items.sort((a, b) => a.x - b.x);
    band.joined = band.items.map((item) => item.text).join("").replace(/\s+/gu, "");
  }
  return bands;
}

/** 款名の抽出: 「第１款議会費（議会局所管）」→ 1 + 議会費 */
function matchKan(joined: string): { number: string; name: string } | null {
  const normalized = toHalfWidthDigits(joined).replace(/\s+/gu, "");
  const match = normalized.match(/第([0-9]{1,2})款(.{1,30}?)(?=[(（]|$)/u);
  if (!match) return null;
  const name = match[2]?.replace(/[(（].*$/u, "").trim() ?? "";
  if (name.length === 0) return null;
  return { number: match[1], name };
}

/** 項ヘッダーの抽出: 「11その他（…所管）」→ 11 + その他 */
const KOU_NAME_NOISE = /[億%％兆]$|[増減]の|を行う|のため|による|整備は|である/u;

function matchKou(joined: string): { number: string; name: string } | null {
  const normalized = toHalfWidthDigits(joined).replace(/\s+/gu, "");
  const match = normalized.match(/^([0-9]{1,2})((?:[^0-9]|[(（]).+)$/u);
  if (!match) return null;
  const rest = match[2];
  if (/^(款|年度|千円|㎥)/.test(rest)) return null; // 款や単位行の誤検知を避ける
  const name = rest
    .replace(/[(（][^）)]*所管[)）].*$/u, "")
    .replace(/[(（].*$/u, "")
    .replace(/[6６]年度.*$/u, "")
    .trim();
  if (name.length === 0 || name.length > 20) return null;
  if (KOU_NAME_NOISE.test(name) || /^[0-9]+$/.test(name)) return null;
  // 分断された数値フラグメント（例: ",000,0005,000,"）は項名ではない
  if (/^[,.]/u.test(name) || /[0-9],[0-9]/u.test(name)) return null;
  return { number: match[1], name };
}

/**
 * ページ1枚から款・項ヘッダーと金額帯を抽出する。
 */
export function parseBudgetOverviewPage(
  pageNumber: number,
  items: readonly PdfTextItem[],
): { headers: BudgetHeaderHit[]; amounts: BudgetAmountBand[] } {
  const headers: BudgetHeaderHit[] = [];
  const amounts: BudgetAmountBand[] = [];
  const bands = buildColumnBands(items);

  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    const kan = matchKan(band.joined);
    if (kan) {
      headers.push({ kind: "kan", ...kan, page: pageNumber, column: band.column, y: band.y });
      continue;
    }
    const kou = matchKou(band.joined);
    if (kou) {
      // 単位「千円」が直近下方向にある帯に隣接している場合のみ項とみなす
      const below = bands.slice(index + 1, index + 4).filter((b) => b.column === band.column);
      const hasUnitNearby = bands
        .slice(Math.max(0, index - 2), index + 4)
        .filter((b) => b.column === band.column)
        .some((b) => b.items.filter((item) => item.text.trim() === "千円").length >= 2);
      if (hasUnitNearby || below.length >= 0) {
        // 追加検証はせず受け入れる（後段の合計検証で品質を担保する）
        headers.push({ kind: "kou", ...kou, page: pageNumber, column: band.column, y: band.y });
      }
      continue;
    }

    // 金額帯: 同じ列の数値トークン3件以上＋近傍に単位・年度ヘッダー。
    // 字間で分断された数値（例: "5"+",000,000"）は連結してから整形式の金額を取り出す。
    const numericFragments = band.items
      .map((item) => item.text.trim())
      .filter((text) => /^[△,.0-9\u30fc\uff0d]+$/u.test(text) && /[0-9]/u.test(text));
    const dashTokens = band.items.filter((item) =>
      /^[\u30fc\uff0d]$/.test(item.text.trim()),
    ).length;
    if (numericFragments.length + Math.min(dashTokens, 1) >= 3 || numericFragments.length >= 3) {
      const joinedNumbers = numericFragments.join("");
      const firstAmount = joinedNumbers.match(/\d{1,3}(?:,\d{3})+/u)?.[0];
      const above = bands.slice(Math.max(0, index - 4), index).filter((b) => b.column === band.column);
      const hasUnitMarker = above.some(
        (b) => b.items.filter((item) => item.text.trim() === "千円").length >= 2,
      );
      const hasYearHeader = above.some((b) => b.joined.includes("年度") && b.joined.includes("比較"));
      if ((hasUnitMarker || hasYearHeader) && firstAmount != null) {
        const negative = /^\s*\u25b3/u.test(joinedNumbers);
        amounts.push({
          page: pageNumber,
          column: band.column,
          y: band.y,
          currentYearToken: negative ? `\u25b3${firstAmount}` : firstAmount,
        });
      }
    }
  }
  return { headers, amounts };
}
