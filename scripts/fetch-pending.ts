import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DataManifest, SourceEntry } from "../src/types.ts";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const manifest = JSON.parse(await readFile(join(ROOT, "data", "manifest.json"), "utf8")) as DataManifest;
const pending = manifest.sources.filter(
  (source): source is SourceEntry & { localPath: string } =>
    source.status === "pending-upstream-503" && Boolean(source.localPath),
);

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

async function fetchOne(source: SourceEntry & { localPath: string }): Promise<void> {
  const target = join(ROOT, source.localPath);
  const temporary = `${target}.partial`;
  await mkdir(resolve(target, ".."), { recursive: true });
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(source.sourceUrl, {
        headers: { "user-agent": "tokyo-budget-execution-2026/1.0" },
        redirect: "follow",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length < 512) throw new Error(`Unexpectedly small response: ${bytes.length} bytes`);
      await writeFile(temporary, bytes);
      await rename(temporary, target);
      console.log(`downloaded\t${source.id}\t${bytes.length}\t${source.sourceUrl}`);
      return;
    } catch (error) {
      await rm(temporary, { force: true });
      console.error(`attempt ${attempt}/3 failed\t${source.id}\t${String(error)}`);
      if (attempt < 3) await sleep(1_000 * 2 ** (attempt - 1));
    }
  }
  process.exitCode = 1;
}

for (const source of pending) await fetchOne(source);
console.log(`pending source count: ${pending.length}`);
