import test from "node:test";
import assert from "node:assert/strict";
import { buildExecutionRequest } from "../src/core/execution-builder.js";
import { resolveModelConfig } from "../src/core/model-config.js";

test("resolveModelConfig uses gpt-5.4 as the default OpenAI model", () => {
  const config = resolveModelConfig({});

  assert.equal(config.provider, "openai");
  assert.equal(config.model, "gpt-5.4");
});

test("resolveModelConfig honors per-repo config defaults and lets flags win", () => {
  const defaults = { provider: "openai", model: "gpt-5.5" };

  // Config default applies when no flag is given.
  assert.equal(resolveModelConfig({}, defaults).model, "gpt-5.5");
  // Explicit flag still overrides the config default.
  assert.equal(resolveModelConfig({ model: "gpt-5.6" }, defaults).model, "gpt-5.6");
  // A config model bound to a different provider does not leak across providers.
  const anthropic = resolveModelConfig({ provider: "anthropic" }, defaults);
  assert.equal(anthropic.provider, "anthropic");
  assert.equal(anthropic.model, "default");
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
