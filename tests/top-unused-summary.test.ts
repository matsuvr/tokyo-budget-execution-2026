import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error Browser build is the runtime contract tested here and has no declaration file.
import { buildTopUnusedSummaryEntries } from "../public/top-unused-summary.js";

type SummaryEntry = {
  rank: string;
  itemId: string;
  title: string;
  budget: string;
  executionRate: string;
  recommendation: string;
};

const data = JSON.parse(
  readFileSync(
    new URL("../data/normalized/execution-review/execution-attention-items.json", import.meta.url),
    "utf8",
  ),
) as { records: unknown[] };

describe("top unused summary", () => {
  it("shows the reviewed top six policy items in unexecuted-amount order", () => {
    const entries = buildTopUnusedSummaryEntries(data.records) as SummaryEntry[];

    assert.deepEqual(
      entries.map(({ rank, title, budget, executionRate }) => ({
        rank,
        title,
        budget,
        executionRate,
      })),
      [
        { rank: "01", title: "高齢福祉費", budget: "876.6億円", executionRate: "74.3％" },
        { rank: "02", title: "医療政策費", budget: "583.3億円", executionRate: "73.8％" },
        { rank: "03", title: "都市改造費", budget: "289.6億円", executionRate: "52.7％" },
        { rank: "04", title: "中小河川整備費", budget: "505.2億円", executionRate: "79.9％" },
        { rank: "05", title: "高潮防御施設費", budget: "358.5億円", executionRate: "74.1％" },
        { rank: "06", title: "生活支援費", budget: "329.8億円", executionRate: "73.6％" },
      ],
    );
  });

  it("keeps one concrete recommendation for every displayed item", () => {
    const entries = buildTopUnusedSummaryEntries(data.records) as SummaryEntry[];

    assert.equal(entries.length, 6);
    assert.ok(entries.every((entry) => entry.recommendation.endsWith("。")));
    assert.equal(
      entries[2]?.recommendation,
      "用地取得と権利者調整の体制を厚くして、予算を実際の工事まで着実につなげる。",
    );
  });
});
