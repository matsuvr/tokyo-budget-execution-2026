import { spawnSync } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const bucket = args[0];
const includeRaw = args.includes("--include-raw");
if (!bucket || bucket.startsWith("--")) {
  console.error("Usage: pnpm run upload:r2 -- <bucket-name> [--include-raw]");
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

const roots = [join(ROOT, "data", "normalized")];
if (includeRaw) roots.push(join(ROOT, "data", "raw"));
const files = [
  ...(await Promise.all(roots.map(walk))).flat(),
  join(ROOT, "data", "manifest.json"),
  join(ROOT, "data", "verification-report.json"),
  join(ROOT, "sources", "official-sources.md"),
];

function contentType(path: string): string {
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".jsonl")) return "application/x-ndjson; charset=utf-8";
  if (path.endsWith(".csv")) return "text/csv; charset=utf-8";
  if (path.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (path.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (path.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

for (const file of files.sort()) {
  const key = relative(ROOT, file).split(sep).join("/");
  const objectPath = `${bucket}/${key}`;
  console.log(`uploading ${objectPath}`);
  const result = spawnSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["exec", "wrangler", "r2", "object", "put", objectPath, "--file", file, "--content-type", contentType(file), "--remote"],
    { cwd: ROOT, stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
