import test from "node:test";
import assert from "node:assert/strict";
import {
  executeProviderRequest,
  registerExecutionAdapter,
  registerHandoffAdapter,
  buildProviderHandoff
} from "../src/adapters/index.js";

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
      id: "resp_test",
      provider: "test-provider",
      status: "completed",
      finishReason: "completed",
      text: `handled:${request.input.promptText}`
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
      input: {
        promptText: "hello"
      }
    },
    commandLabel: "atlas exec run"
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "completed");
  assert.equal(result.response.id, "resp_test");
  assert.equal(result.response.text, "handled:hello");
});

test("handoff adapter registry dispatches to registered handoff adapters", async () => {
  registerHandoffAdapter("handoff-test-provider", async ({ request }) => ({
    ok: true,
    status: "prepared",
    handoff: {
      provider: "handoff-test-provider",
      mode: "manual",
      promptText: request.input.promptText,
      instructions: ["paste into target tool"]
    }
  }));

  const result = await buildProviderHandoff({
    provider: "handoff-test-provider",
    request: {
      model: "fake",
      input: {
        promptText: "hello"
      }
    },
    commandLabel: "atlas exec handoff"
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "prepared");
  assert.equal(result.handoff.provider, "handoff-test-provider");
  assert.equal(result.handoff.promptText, "hello");
});
