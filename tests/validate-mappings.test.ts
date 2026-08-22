import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateAndMergeMappings,
  type MappableMappingRecord,
} from "../src/execution-review/mapping/validate-mappings.ts";

function key(chapter: string, section?: string) {
  return { account: "一般会計", chapter, ...(section != null ? { section } : {}) };
}

const INDEX = {
  fy2024: new Map([
    ["総務費", new Set(["1"])],
    ["福祉費|生活福祉費", new Set(["1"])],
  ]),
  fy2026: new Map([
    ["総務費", new Set(["1"])],
    ["福祉費|生活福祉費", new Set(["1"])],
  ]),
};

function baseRecord(overrides: Partial<MappableMappingRecord>): MappableMappingRecord {
  return {
    mappingId: "map-0001",
    fiscalYear2024: [key("02:総務費")],
    fiscalYear2026: [key("02:総務費")],
    granularity: "chapter",
    confidence: "A",
    relationType: "exact",
    evidence: { title: "t", url: "https://x", page: null },
    ...overrides,
  };
}

describe("validateAndMergeMappings", () => {
  it("正常なA対応を受理する", () => {
    const result = validateAndMergeMappings([baseRecord({})], INDEX);
    assert.equal(result.issues.length, 0);
    assert.equal(result.summary.A, 1);
    assert.equal(result.records[0].aggregatable, true);
  });

  it("重複IDを検出する", () => {
    const result = validateAndMergeMappings([baseRecord({}), baseRecord({})], INDEX);
    assert.ok(result.issues.some((issue) => issue.code === "duplicate-id"));
  });

  it("参照切れキーを検出する", () => {
    const result = validateAndMergeMappings(
      [baseRecord({ fiscalYear2026: [key("99:存在しない費")] })],
      INDEX,
    );
    assert.ok(result.issues.some((issue) => issue.code === "missing-fy2026-key"));
  });

  it("Aの出典欠落を検出する", () => {
    const record = baseRecord({});
    delete (record as { evidence?: unknown }).evidence;
    const result = validateAndMergeMappings([record], INDEX);
    assert.ok(result.issues.some((issue) => issue.code === "ab-missing-evidence"));
  });

  it("Aの非一対一と非exactを検出する", () => {
    const many = baseRecord({
      fiscalYear2026: [key("02:総務費"), key("02:総務費")],
      relationType: "merged",
      confidence: "A",
    });
    const result = validateAndMergeMappings([many], INDEX);
    assert.ok(result.issues.some((issue) => issue.code === "a-not-one-to-one"));
    assert.ok(result.issues.some((issue) => issue.code === "a-relation-type-invalid"));
  });

  it("split/mergedの按分額を検出する", () => {
    const record = baseRecord({
      relationType: "merged",
      confidence: "B",
      prorationYen: [100, 200],
    });
    const result = validateAndMergeMappings([record], INDEX);
    assert.ok(result.issues.some((issue) => issue.code === "proration-amount-present"));
  });

  it("同一2024キーの矛盾割当を検出する", () => {
    const second = baseRecord({
      mappingId: "map-0002",
      fiscalYear2026: [key("07:福祉費")],
    });
    const result = validateAndMergeMappings([baseRecord({}), second], INDEX);
    assert.ok(result.issues.some((issue) => issue.code === "conflicting-assignment"));
  });

  it("C/unmatchedはaggregatable=falseで残る", () => {
    const unmatched = baseRecord({
      mappingId: "map-0009",
      confidence: "unmatched",
      fiscalYear2026: [],
      evidence: undefined,
    });
    delete (unmatched as { evidence?: unknown }).evidence;
    const result = validateAndMergeMappings([baseRecord({}), unmatched], INDEX);
    assert.equal(result.summary.unmatched, 1);
    const target = result.records.find((record) => record.mappingId === "map-0009");
    assert.equal(target?.aggregatable, false);
  });
});
