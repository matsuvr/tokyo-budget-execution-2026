import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { questionsForExecutionMethod } from "../src/execution-review/investigation-questions.ts";
import type { ExecutionMethod } from "../src/execution-review/types.ts";

describe("investigation questions", () => {
  it("covers every execution method without causal assertions", () => {
    const methods: ExecutionMethod[] = ["direct", "procurement", "construction", "subsidy", "statutory-transfer", "unknown"];
    for (const method of methods) {
      for (const question of questionsForExecutionMethod(method)) {
        assert.match(question.text, /[か。]$/u);
        assert.doesNotMatch(question.text, /人手不足だった|入札不調だった/u);
      }
    }
    assert.deepEqual(questionsForExecutionMethod("statutory-transfer"), []);
  });
  it("returns copies", () => {
    const first = questionsForExecutionMethod("direct") as { code: string; text: string }[];
    first[0].text = "changed";
    assert.notEqual(questionsForExecutionMethod("direct")[0].text, "changed");
  });
});
