import test from "node:test";
import assert from "node:assert/strict";
import { executeOpenAIRequest } from "../src/adapters/openai.js";

test("openai adapter reports missing api key clearly", async () => {
  const result = await executeOpenAIRequest({
    request: {
      model: "codex",
      input: {
        promptText: "hello"
      }
    },
    apiKey: ""
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "missing_api_key");
  assert.equal(result.error.message, "OPENAI_API_KEY is required for `atlas exec run`.");
});

test("openai adapter can label missing api key errors for callers", async () => {
  const result = await executeOpenAIRequest({
    request: {
      model: "codex",
      input: {
        promptText: "hello"
      }
    },
    apiKey: "",
    commandLabel: "atlas patch stage"
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.message, "OPENAI_API_KEY is required for `atlas patch stage`.");
});

test("openai adapter normalizes a successful responses api payload", async () => {
  const result = await executeOpenAIRequest({
    request: {
      model: "codex",
      input: {
        promptText: "hello"
      }
    },
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          id: "resp_123",
          status: "completed",
          output_text: "Proposed fix",
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150
          }
        };
      }
    })
  });

  assert.equal(result.ok, true);
  assert.equal(result.response.id, "resp_123");
  assert.equal(result.response.text, "Proposed fix");
  assert.equal(result.usage.totalTokens, 150);
});
