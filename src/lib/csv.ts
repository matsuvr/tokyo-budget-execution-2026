export interface DecodedText {
  encoding: "utf-8" | "shift_jis";
  text: string;
}

export function decodeText(bytes: Uint8Array): DecodedText {
  try {
    return {
      encoding: "utf-8",
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    };
  } catch {
    return {
      encoding: "shift_jis",
      text: new TextDecoder("shift_jis", { fatal: false }).decode(bytes),
    };
  }
}

export function parseCsvEach(
  text: string,
  onRow: (row: string[], rowIndex: number) => void,
): void {
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let rowIndex = 0;

  const emitField = (): void => {
    row.push(field);
    field = "";
  };

  const emitRow = (): void => {
    emitField();
    onRow(row, rowIndex++);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ",") {
      emitField();
    } else if (char === "\n") {
      emitRow();
    } else if (char === "\r") {
      if (text[i + 1] === "\n") i += 1;
      emitRow();
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) emitRow();
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  parseCsvEach(text, (row) => rows.push(row));
  return rows;
}

function quoteCsv(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function stringifyCsv(rows: readonly (readonly unknown[])[]): string {
  return `${rows.map((row) => row.map(quoteCsv).join(",")).join("\r\n")}\r\n`;
}
