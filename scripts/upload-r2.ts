import { spawnSync } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * R2アップロード（Issue #42）。
 * - 既定対象: data/normalized 配下の生成物 + manifest + 検証レポート + ソース一覧。
 * - 既定除外: 中間解析用の settlement-rows.jsonl、公金支出の巨大な transactions.jsonl、*.partial。
 * - 執行レビュー配信に必須のファイルが欠けている場合は警告して非0終了する。
 * - --list でアップロード予定一覧のみ表示できる（dry-run）。
 */

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const bucket = args[0];
const includeRaw = args.includes("--include-raw");
const dryRun = args.includes("--list");
if (!bucket || bucket.startsWith("--")) {
  console.error("Usage: pnpm run upload:r2 -- <bucket-name> [--include-raw] [--list]");
  process.exit(2);
}

async function walk(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory)) {
    const path = join(directory, entry);
    if ((await stat(path)).isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

function relativeKey(file: string): string {
  return relative(ROOT, file).split(sep).join("/");
}

/** 既定アップロードから除外する中間解析・巨大ファイル */
const DEFAULT_EXCLUDED_PATTERNS: readonly RegExp[] = [
  /\/settlement-rows\.jsonl$/u,
  /\/transactions\.jsonl$/u,
  /\.partial$/u,
];

const REQUIRED_EXECUTION_REVIEW_KEYS: readonly string[] = [
  "data/normalized/execution-review/index.json",
  "data/normalized/execution-review/fy2024/execution-scan.json",
  "data/normalized/execution-review/budget-comparisons.json",
  "data/normalized/execution-review/review-candidates.json",
  "data/normalized/execution-review/bureau-summary.json",
  "data/normalized/execution-review/policy-review-details.json",
  "data/normalized/execution-review/payment-evidence.json",
  "data/normalized/execution-review/fy2024/verification.json",
  "data/verification-report.json",
];

const roots = [join(ROOT, "data", "normalized")];
if (includeRaw) roots.push(join(ROOT, "data", "raw"));
const files = [
  ...(await Promise.all(roots.map(walk))).flat(),
  join(ROOT, "data", "manifest.json"),
  join(ROOT, "data", "verification-report.json"),
  join(ROOT, "sources", "official-sources.md"),
].filter((file) => {
  if (includeRaw) return true;
  const key = relativeKey(file);
  return !DEFAULT_EXCLUDED_PATTERNS.some((pattern) => pattern.test(`/${key}`));
});

const missingRequired = REQUIRED_EXECUTION_REVIEW_KEYS.filter((key) => !files.includes(join(ROOT, key)));
if (missingRequired.length > 0) {
  console.error("既定アップロードに必須ファイルが欠けています（pnpm run prepare:data / 各buildを実行してください）:");
  for (const key of missingRequired) console.error(`  - ${key}`);
  process.exit(1);
}

function contentType(path: string): string {
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".jsonl")) return "application/x-ndjson; charset=utf-8";
  if (path.endsWith(".csv")) return "text/csv; charset=utf-8";
  if (path.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (path.endsWith(".xlsx"))
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (path.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

function cacheControl(key: string): string | undefined {
  // 頻繁に再生成される概要indexは短め、その他のJSONは1時間のキャッシュを許容
  if (key.endsWith("execution-review/index.json")) return "public, max-age=60";
  if (key.endsWith(".json")) return "public, max-age=3600";
  return undefined;
}

for (const file of files.sort()) {
  const key = relativeKey(file);
  const objectPath = `${bucket}/${key}`;
  if (dryRun) {
    const cc = cacheControl(key);
    console.log(`would upload ${objectPath} (${contentType(file)}${cc ? `, cache-control: ${cc}` : ""})`);
    continue;
  }
  console.log(`uploading ${objectPath}`);
  const extraArgs: string[] = [];
  const cc = cacheControl(key);
  if (cc != null) extraArgs.push("--cache-control", cc);
  const result = spawnSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    [
      "exec",
      "wrangler",
      "r2",
      "object",
      "put",
      objectPath,
      "--file",
      file,
      "--content-type",
      contentType(file),
      ...extraArgs,
      "--remote",
    ],
    { cwd: ROOT, stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
