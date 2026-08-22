#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * リポジトリ内の追跡対象ファイルすべてのSHA-256を CHECKSUMS.sha256 へ出力する。
 * - .git / node_modules / .wrangler とOS・エディタ由来の除外物を除く。
 * - CHECKSUMS.sha256 自身とローカル設定 wrangler.jsonc は含めない。
 */

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const OUTPUT_NAME = "CHECKSUMS.sha256";
const SKIP_DIRS = new Set([".git", "node_modules", ".wrangler"]);
const SKIP_FILES = new Set([OUTPUT_NAME, "wrangler.jsonc"]);
const SKIP_SUFFIXES = [".DS_Store", ".partial", ".log"];

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...(await walk(join(dir, entry.name))));
    } else if (entry.isFile()) {
      if (SKIP_FILES.has(entry.name)) continue;
      if (SKIP_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) continue;
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

const files = (await walk(ROOT)).sort();
const lines: string[] = [];
for (const file of files) {
  const bytes = await readFile(file);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const relativePath = `./${relative(ROOT, file)}`;
  lines.push(`${digest}  ${relativePath}`);
}
await writeFile(join(ROOT, OUTPUT_NAME), `${lines.join("\n")}\n`, "utf8");

const totalBytes = (
  await Promise.all(files.map(async (file) => (await stat(file)).size))
).reduce((sum, size) => sum + size, 0);
console.log(JSON.stringify({ fileCount: files.length, totalBytes }, null, 2));
