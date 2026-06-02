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
  assert.equal(result.error.provider, "openai");
  assert.equal(result.error.retryable, false);
  assert.equal(result.error.status, null);
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

test("openai adapter marks transient transport failures as retryable", async () => {
  const result = await executeOpenAIRequest({
    request: {
      model: "gpt-5.4",
      input: {
        promptText: "hello"
      }
    },
    apiKey: "test-key",
    fetchImpl: async () => {
      throw new Error("socket hang up");
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "network_error");
  assert.equal(result.error.provider, "openai");
  assert.equal(result.error.retryable, true);
  assert.equal(result.error.status, null);
});

test("openai adapter keeps client errors non-retryable", async () => {
  const result = await executeOpenAIRequest({
    request: {
      model: "gpt-5.4",
      input: {
        promptText: "hello"
      }
    },
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: false,
      status: 400,
      async json() {
        return {
          error: {
            code: "bad_request",
            message: "invalid request"
          }
        };
      }
    })
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "bad_request");
  assert.equal(result.error.provider, "openai");
  assert.equal(result.error.retryable, false);
  assert.equal(result.error.status, 400);
});

test("openai adapter normalizes malformed successful provider payloads", async () => {
  const result = await executeOpenAIRequest({
    request: {
      model: "gpt-5.4",
      input: {
        promptText: "hello"
      }
    },
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return null;
      }
    })
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "malformed_provider_response");
  assert.equal(result.error.provider, "openai");
  assert.equal(result.error.retryable, false);
  assert.equal(result.error.status, 200);
});

test("openai adapter normalizes empty model output", async () => {
  const result = await executeOpenAIRequest({
    request: {
      model: "gpt-5.4",
      input: {
        promptText: "hello"
      }
    },
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          id: "resp_empty",
          status: "completed",
          output_text: ""
        };
      }
    })
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "empty_response");
  assert.equal(result.error.provider, "openai");
  assert.equal(result.error.retryable, false);
  assert.equal(result.error.status, 200);
});

test("openai adapter marks retryable http failures with provider and status", async () => {
  const result = await executeOpenAIRequest({
    request: {
      model: "gpt-5.4",
      input: {
        promptText: "hello"
      }
    },
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      async json() {
        return {
          error: {
            message: "server unavailable"
          }
        };
      }
    })
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "http_500");
  assert.equal(result.error.message, "server unavailable");
  assert.equal(result.error.provider, "openai");
  assert.equal(result.error.retryable, true);
  assert.equal(result.error.status, 500);
});
