import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * PDFテキスト項目を座標付きで抽出するユーティリティ（Issue #14）。
 * - OCR・画像変換を使わず、pdfjs-distのテキストレイヤーのみを使う。
 * - ページ番号は原本上の表示番号ではなく、PDFの1始まり物理ページとする。
 * - 出力順序は安定させる: y降順（上→下）、同一y帯はx昇順（左→右）。
 * - 純粋関数(normalizePdfTextItems)とI/O(extractPageTextItems)を分離する。
 */

export interface PdfTextItem {
  /** 抽出した文字列。空白のみの項目は除外し、文字列内の空白・全角記号は保持する。 */
  text: string;
  /** PDFユーザー空間のX座標（小数第2位で丸める）。 */
  x: number;
  /** PDFユーザー空間のY座標（小数第2位で丸める）。上ほど大きい。 */
  y: number;
  width: number;
  height: number;
  /** 1始まり物理ページ番号。 */
  page: number;
}

/** pdfjs-distが返すテキスト項目のうち、本モジュールが依存するフィールドのみ。 */
export interface RawPdfTextItem {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isBlank(text: string): boolean {
  // \sには全角空白(U+3000)も含まれる。
  return /^\s*$/u.test(text);
}

/**
 * 生テキスト項目を安定した順序へ正規化する純粋関数。
 * - 空文字列・空白のみの項目は破棄する。
 * - 座標はtransform[4](x), transform[5](y)を採用し小数第2位で丸める。
 * - y降順→x昇順でソートする（元配列は変更しない）。
 */
export function normalizePdfTextItems(
  pageNumber: number,
  rawItems: readonly RawPdfTextItem[],
): PdfTextItem[] {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new RangeError(`pageNumber must be a positive integer: ${pageNumber}`);
  }
  const normalized: PdfTextItem[] = [];
  for (const raw of rawItems) {
    const text = raw.str ?? "";
    if (text.length === 0 || isBlank(text)) continue;
    const transform = raw.transform ?? [];
    normalized.push({
      text,
      x: round2(transform[4] ?? Number.NaN),
      y: round2(transform[5] ?? Number.NaN),
      width: round2(raw.width ?? Number.NaN),
      height: round2(raw.height ?? Number.NaN),
      page: pageNumber,
    });
  }
  return normalized.sort((a, b) => b.y - a.y || a.x - b.x);
}

/**
 * 指定PDF・指定物理ページから座標付きテキスト項目を抽出する。
 * @param pdfBytes PDFファイルのバイト列（呼び出し元のバッファは変更しない）
 */
export async function extractPageTextItems(
  pdfBytes: Uint8Array | ArrayBuffer,
  pageNumber: number,
): Promise<PdfTextItem[]> {
  const copied = new Uint8Array(pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes));
  const loadingTask = getDocument({
    data: copied,
    useSystemFonts: false,
  });
  const document = await loadingTask.promise;
  try {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    return normalizePdfTextItems(pageNumber, content.items as RawPdfTextItem[]);
  } finally {
    await loadingTask.destroy();
  }
}
