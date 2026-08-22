import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { contentTypeIs, isMagicBytes } from "../../src/execution-review/download.ts";

/**
 * 公式原本の冪等ダウンロード。
 * - 既存ファイルが検証を通る場合は再取得せずスキップする（再実行で破壊しない）。
 * - .partialへ書き出してからrenameする原子置換を行う。
 * - HTTP失敗・content-type不一致・マジックバイト不一致を成功扱いしない。
 */

export interface FetchDocumentOptions {
  url: string;
  targetPath: string;
  /** 先頭バイトの期待値（例: "%PDF-"、ZIPの"PK\x03\x04"）。未指定なら検証しない。 */
  magic?: string;
  /** 期待するMIME型（例: "application/pdf"）。未指定ならcontent-typeを検証しない。 */
  mime?: string;
}

export interface FetchDocumentResult {
  id: string;
  status: "downloaded" | "kept";
  bytes: number;
  sha256: string;
  url: string;
  targetPath: string;
}

async function digest(path: string): Promise<{ bytes: number; sha256: string }> {
  const buffer = await readFile(path);
  return {
    bytes: (await stat(path)).size,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

export async function fetchDocument(
  id: string,
  options: FetchDocumentOptions,
): Promise<FetchDocumentResult> {
  const target = resolve(options.targetPath);
  const temporary = `${target}.partial`;

  // 既存ファイルが正当なら再取得しない。
  try {
    const existing = await digest(target);
    console.log(`kept\t${id}\t${existing.bytes}\t${target}`);
    return { id, status: "kept", ...existing, url: options.url, targetPath: target };
  } catch {
    // ファイルが存在しない場合のみ続行する。
  }

  await mkdir(dirname(target), { recursive: true });
  let lastError = "unknown";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(options.url, {
        headers: { "user-agent": "tokyo-budget-execution-2026/1.0" },
        redirect: "follow",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (options.mime && !contentTypeIs(response.headers.get("content-type"), options.mime)) {
        throw new Error(
          `unexpected content-type: ${response.headers.get("content-type")} (expected ${options.mime})`,
        );
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (options.magic && !isMagicBytes(bytes, options.magic)) {
        throw new Error(`magic byte mismatch (expected ${JSON.stringify(options.magic)})`);
      }
      await writeFile(temporary, bytes);
      await rename(temporary, target);
      const file = await digest(target);
      console.log(`downloaded\t${id}\t${file.bytes}\t${options.url}`);
      return { id, status: "downloaded", ...file, url: options.url, targetPath: target };
    } catch (error) {
      lastError = String(error);
      await rm(temporary, { force: true });
      console.error(`attempt ${attempt}/3 failed\t${id}\t${lastError}`);
      if (attempt < 3) await sleep(1_000 * 2 ** (attempt - 1));
    }
  }
  throw new Error(`fetch failed: ${id}: ${lastError}`);
}
