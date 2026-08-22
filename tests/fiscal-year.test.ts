import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isFiscalYear, FISCAL_YEARS } from "../src/types.ts";
import type {
  FiscalYear,
  DataManifest,
  PublicExpenditureRecord,
  PayrollRecord,
} from "../src/types.ts";

describe("FiscalYear type and helpers", () => {
  it("accepts 2024, 2025, 2026", () => {
    assert.equal(isFiscalYear(2024), true);
    assert.equal(isFiscalYear(2025), true);
    assert.equal(isFiscalYear(2026), true);
  });

  it("rejects 2023 and other values", () => {
    assert.equal(isFiscalYear(2023), false);
    assert.equal(isFiscalYear(2027), false);
    assert.equal(isFiscalYear(0), false);
    assert.equal(isFiscalYear(Number.NaN), false);
  });

  it("does not use string partial matching", () => {
    // Ensure check is numeric equality, not string includes
    // e.g., "2024" should not be considered, and 202 should not match
    assert.equal(isFiscalYear(202), false);
    assert.equal(isFiscalYear(24), false);
  });

  it("FISCAL_YEARS contains exactly 2024-2026", () => {
    assert.deepEqual([...FISCAL_YEARS], [2024, 2025, 2026]);
  });

  it("FiscalYear type allows 2024 in records", () => {
    const record: PublicExpenditureRecord = {
      fiscalYear: 2024 as FiscalYear,
      sourceMonth: "2024-04",
      sourceFile: "test.csv",
      sourceRow: 1,
      paidAt: "2024-04-01",
      bureau: "Test",
      department: "Dept",
      section: "Sec",
      account: "Account",
      chapter: "Chapter",
      item: "Item",
      object: "Object",
      expenseSection: "Section",
      expenseSubsection: null,
      description: "test",
      amountYen: 1000,
      isClosingPeriod: false,
    };
    assert.equal(record.fiscalYear, 2024);

    const payroll: PayrollRecord = {
      fiscalYear: 2024,
      sourceFile: "payroll.csv",
      paidMonth: "2024-04",
      category: "test",
      amountYen: 1000,
    };
    assert.equal(payroll.fiscalYear, 2024);
  });

  it("DataManifest requestedFiscalYears can represent [2024,2025,2026]", () => {
    const manifest: DataManifest = {
      generatedAt: new Date().toISOString(),
      packageName: "test",
      packageVersion: "1.0.0",
      timezone: "Asia/Tokyo",
      requestedFiscalYears: [2024, 2025, 2026],
      sources: [],
    };
    assert.deepEqual(manifest.requestedFiscalYears, [2024, 2025, 2026]);
    // Ensure 2023 is rejected at type level (runtime check)
    assert.equal(isFiscalYear(2023), false);
  });

  it("type guard narrows correctly", () => {
    const value: number = 2024;
    if (isFiscalYear(value)) {
      // Inside this block, value should be FiscalYear
      const fy: FiscalYear = value;
      assert.equal(fy, 2024);
    } else {
      assert.fail("2024 should be FiscalYear");
    }

    const invalid: number = 2023;
    assert.equal(isFiscalYear(invalid), false);
  });
});
