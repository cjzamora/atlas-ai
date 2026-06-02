import test from "node:test";
import assert from "node:assert/strict";
import { buildExecutionRequest } from "../src/core/execution-builder.js";
import { resolveModelConfig } from "../src/core/model-config.js";

test("resolveModelConfig uses gpt-5.4 as the default OpenAI model", () => {
  const config = resolveModelConfig({});

  assert.equal(config.provider, "openai");
  assert.equal(config.model, "gpt-5.4");
});

test("buildExecutionRequest uses the resolved default model when none is provided", () => {
  const config = resolveModelConfig({});
  const request = buildExecutionRequest({
    task: "fix metering fallback bug",
    classification: {
      taskType: "bug_fix",
      risk: "low",
      contextBudget: "small"
    },
    bundle: {
      selectedTests: [],
      files: []
    },
    prompt: "hello",
    provider: config.provider,
    model: config.model
  });

  assert.equal(request.provider, "openai");
  assert.equal(request.model, "gpt-5.4");
});
