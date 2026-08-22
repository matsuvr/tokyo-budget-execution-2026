/**
 * 取得原本のマジックバイト・content-type検証の純粋関数。
 * - HTMLエラーページをPDF/XLSXとして保存しないための検証。
 * - 入力は変更しない。
 */

export const PDF_MAGIC = "%PDF-";
export const ZIP_MAGIC = "PK\x03\x04";

/** 先頭バイトが期待するASCIIプレフィックスと一致するか検証する。 */
export function isMagicBytes(bytes: Uint8Array, magic: string): boolean {
  return startsWithAscii(bytes, magic);
}

/** PDFのマジックバイト（先頭 `%PDF-`）を検証する。 */
export function isPdfBytes(bytes: Uint8Array): boolean {
  return startsWithAscii(bytes, PDF_MAGIC);
}

/** XLSX等のZIPコンテナ（先頭 `PK\x03\x04`）を検証する。 */
export function isZipBytes(bytes: Uint8Array): boolean {
  return startsWithAscii(bytes, ZIP_MAGIC);
}

/**
 * content-typeが期待するMIME型と一致するか検証する。
 * サーバーがパラメータ付き（例: application/pdf; charset=binary）で返しても許容する。
 */
export function contentTypeIs(contentType: string | null | undefined, mime: string): boolean {
  if (!contentType) return false;
  return contentType.split(";")[0]?.trim().toLowerCase() === mime;
}

function startsWithAscii(bytes: Uint8Array, prefix: string): boolean {
  if (bytes.length < prefix.length) return false;
  for (let index = 0; index < prefix.length; index += 1) {
    if (bytes[index] !== prefix.charCodeAt(index)) return false;
  }
  return true;
}
