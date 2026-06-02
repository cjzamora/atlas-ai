import test from "node:test";
import assert from "node:assert/strict";
import { executeProviderRequest, registerExecutionAdapter } from "../src/adapters/index.js";

test("adapter registry rejects unsupported providers with a normalized failure", async () => {
  const result = await executeProviderRequest({
    provider: "claude",
    request: {
      model: "sonnet",
      prompt: "hello"
    },
    commandLabel: "atlas exec run"
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "unsupported_provider");
  assert.match(result.error.message, /Provider "claude" is not supported yet/);
});

test("adapter registry dispatches to registered adapters", async () => {
  registerExecutionAdapter("test-provider", async ({ request }) => ({
    ok: true,
    status: "completed",
    response: {
      responseId: "resp_test",
      finishReason: "completed",
      outputText: `handled:${request.prompt}`
    },
    usage: {
      inputTokens: 1,
      outputTokens: 2,
      totalTokens: 3
    }
  }));

  const result = await executeProviderRequest({
    provider: "test-provider",
    request: {
      model: "fake",
      prompt: "hello"
    },
    commandLabel: "atlas exec run"
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "completed");
  assert.equal(result.response.responseId, "resp_test");
  assert.equal(result.response.outputText, "handled:hello");
});
