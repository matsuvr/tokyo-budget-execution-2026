import { loadBudgetSeries, readJson } from "../src/local.ts";

interface BudgetTable {
  records: Record<string, unknown>[];
}
interface Aggregate {
  key: string;
  transactionCount: number;
  amountYen: number;
}
interface MonthAggregate {
  month: string;
  transactionCount: number;
  transactionAmountYen: number;
  payrollAmountYen: number;
  combinedAmountYen: number;
}

const budget = (await loadBudgetSeries("01_sainyu_saishutsu")) as unknown as BudgetTable;
function generalAccountExpenditure(year: 2025 | 2026): number | null {
  const row = budget.records.find(
    (record) =>
      Number(record["年度"]) === year &&
      record["区分"] === "歳出" &&
      String(record["区分2"]) === String(year),
  );
  return typeof row?.["金額（億円）"] === "number" ? (row["金額（億円）"] as number) : null;
}

const topBureaus = await readJson<Aggregate[]>(
  "data/normalized/public-expenditure/fy2026/by-bureau.json",
);
const monthly = await readJson<MonthAggregate[]>(
  "data/normalized/public-expenditure/fy2026/by-month.json",
);

console.log(
  JSON.stringify(
    {
      budgetComparison: {
        unit: "億円",
        fiscalYear2025: generalAccountExpenditure(2025),
        fiscalYear2026: generalAccountExpenditure(2026),
      },
      fiscalYear2026PublishedMonths: monthly,
      fiscalYear2026TopBureausByPublishedPayments: topBureaus.slice(0, 10),
      caution:
        "予算CSVと公金支出明細は分類体系・粒度が異なるため、この例は執行率を算出していません。",
    },
    null,
    2,
  ),
);
