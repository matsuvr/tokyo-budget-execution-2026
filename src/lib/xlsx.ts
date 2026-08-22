import { inflateRawSync } from "node:zlib";
import { readFile } from "node:fs/promises";

interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const signature = 0x06054b50;
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) return offset;
  }
  throw new Error("ZIP end-of-central-directory record not found");
}

function readZipEntries(buffer: Buffer): Map<string, Buffer> {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`Invalid ZIP central-directory signature at ${offset}`);
    }
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");
    entries.push({ name, compressionMethod, compressedSize, localHeaderOffset });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  const output = new Map<string, Buffer>();
  for (const entry of entries) {
    if (entry.name.endsWith("/")) continue;
    const localOffset = entry.localHeaderOffset;
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`Invalid ZIP local-header signature for ${entry.name}`);
    }
    const fileNameLength = buffer.readUInt16LE(localOffset + 26);
    const extraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + fileNameLength + extraLength;
    const compressed = buffer.subarray(dataOffset, dataOffset + entry.compressedSize);
    let data: Buffer;
    if (entry.compressionMethod === 0) data = Buffer.from(compressed);
    else if (entry.compressionMethod === 8) data = inflateRawSync(compressed);
    else
      throw new Error(
        `Unsupported ZIP compression method ${entry.compressionMethod} for ${entry.name}`,
      );
    output.set(entry.name, data);
  }
  return output;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/giu, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/gu, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function xmlText(fragment: string): string {
  const withoutPhonetics = fragment
    .replace(/<rPh\b[\s\S]*?<\/rPh>/gu, "")
    .replace(/<phoneticPr\b[^>]*\/?\s*>/gu, "");
  const texts: string[] = [];
  for (const match of withoutPhonetics.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gu)) {
    texts.push(decodeXmlEntities(match[1]));
  }
  return texts.join("");
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const strings: string[] = [];
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gu)) {
    strings.push(xmlText(match[1]));
  }
  return strings;
}

function columnIndex(cellReference: string): number {
  const letters = cellReference.match(/^[A-Z]+/u)?.[0] ?? "A";
  let value = 0;
  for (const character of letters) value = value * 26 + character.charCodeAt(0) - 64;
  return value - 1;
}

function attribute(attributes: string, name: string): string | undefined {
  return attributes.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`, "u"))?.[1];
}

function parseWorksheet(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gu)) {
    const row: string[] = [];
    const cellFragment = rowMatch[1];
    const cellPattern = /<c\b([^>]*?)(?:>([\s\S]*?)<\/c>|\/\s*>)/gu;
    for (const cellMatch of cellFragment.matchAll(cellPattern)) {
      const attributes = cellMatch[1] ?? "";
      const body = cellMatch[2] ?? "";
      const reference = attribute(attributes, "r") ?? `A${rows.length + 1}`;
      const type = attribute(attributes, "t");
      const valueText = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/u)?.[1] ?? "";
      let value = "";
      if (type === "s") value = sharedStrings[Number(valueText)] ?? "";
      else if (type === "inlineStr") value = xmlText(body);
      else if (type === "b") value = valueText === "1" ? "true" : "false";
      else value = decodeXmlEntities(valueText);
      row[columnIndex(reference)] = value;
    }
    for (let index = 0; index < row.length; index += 1) row[index] ??= "";
    rows.push(row);
  }
  return rows;
}

export async function readFirstWorksheet(path: string): Promise<string[][]> {
  const archive = readZipEntries(await readFile(path));
  const worksheet = archive.get("xl/worksheets/sheet1.xml");
  if (!worksheet) throw new Error(`Worksheet xl/worksheets/sheet1.xml not found: ${path}`);
  const sharedStrings = parseSharedStrings(archive.get("xl/sharedStrings.xml")?.toString("utf8"));
  return parseWorksheet(worksheet.toString("utf8"), sharedStrings);
}
