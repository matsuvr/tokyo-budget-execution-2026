import { parseAmountYen } from "../settlement/parse-amount.ts";

/**
 * 令和8年度一般会計予算 議案第1号（budget-bill.pdf）の歳出款・項行を
 * パースする純粋関数群（Issue #24）。
 *
 * 入力は pdftotext -layout の出力（行配列）。この文書の数字は埋め込みフォントの
 * ToUnicodeが欠落しておりpdfjsで抽出できないため、popplerのテキストレイヤーを使う。
 *
 * レイアウト:
 *   01議   会費                                                   6,010,000
 *                    01   都議会費                               6,010,000
 */

export interface BudgetBillLine {
  level: "kan" | "kou";
  /** 款番号または項番号（10進） */
  number: string;
  /** 名称（字間空白を除去した原文表記） */
  name: string;
  /** 金額（千円→円換算済み） */
  initialBudgetYen: number;
}

export interface BudgetBillParseResult {
  lines: BudgetBillLine[];
  /** 歳出節の開始を検出したか */
  started: boolean;
}

const KAN_LINE = /^ {0,3}(\d{2})(\S[^(]*?) {2,}([0-9][0-9,]{3,}) *$/u;
const KOU_LINE = /^ {4,}(\d{1,2}) +(\S.*?) {2,}([0-9][0-9,]{3,}) *$/u;

function cleanName(raw: string): string {
  return raw.replace(/\s+/gu, "").trim();
}

/**
 * 議案テキストから歳出の款・項行を抽出する。
 * - 「歳出 (単位 千円)」の見出し以降、「第2号」の前までを対象とする。
 * - 各項の金額合計が款の金額と一致することを呼び出し側で検証する。
 */
export function parseBudgetBillExpenditure(text: string): BudgetBillParseResult {
  const rawLines = text.split(/\r?\n/u);
  let started = false;

  // 総則の総額（例: それぞれ9,653,000,000千円）
  const totalMatch = text.replace(/\s+/gu, "").match(/それぞれ([0-9,]+)千(?:円|圓)/u);
  const declaredTotalThousandYen =
    totalMatch?.[1] != null ? Number.parseInt(totalMatch[1].replace(/,/gu, ""), 10) : null;

  const lines: BudgetBillLine[] = [];
  for (let lineIndex = 0; lineIndex < rawLines.length; lineIndex += 1) {
    const raw = rawLines[lineIndex];
    const line = raw.replace(/\s+$/u, "");
    if (!started) {
      if (/^\s*歳 ?出(?:\s|$)/u.test(line)) {
        const context = rawLines.slice(lineIndex, lineIndex + 3).join("\n");
        if (/単位/.test(context) && /千 ?円/.test(context)) started = true;
      }
      continue;
    }
    if (/^\s*第2号/u.test(line)) {
      break;
    }
    if (/単位|^科|^目$|^金|^款$|^項$|^[0-9]+$/.test(line.trim()) && !KAN_LINE.test(line) && !KOU_LINE.test(line)) {
      continue;
    }

    const kan = line.match(KAN_LINE);
    if (kan) {
      const yen = parseAmountYen(kan[3], { unit: "thousand-yen" });
      if (yen == null) continue;
      lines.push({ level: "kan", number: kan[1], name: cleanName(kan[2]), initialBudgetYen: yen });
      continue;
    }
    const kou = line.match(KOU_LINE);
    if (kou) {
      const yen = parseAmountYen(kou[3], { unit: "thousand-yen" });
      if (yen == null) continue;
      lines.push({ level: "kou", number: kou[1], name: cleanName(kou[2]), initialBudgetYen: yen });
    }
  }
  return { lines, started };
}

/** 総則に記載された歳入歳出予算総額（千円）を抽出する。 */
export function extractDeclaredTotalThousandYen(text: string): number | null {
  const totalMatch = text.replace(/\s+/gu, "").match(/それぞれ([0-9,]+)千(?:円|圓)/u);
  if (totalMatch?.[1] == null) return null;
  return Number.parseInt(totalMatch[1].replace(/,/gu, ""), 10);
}
