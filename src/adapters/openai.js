import { registerExecutionAdapter } from "./index.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export async function executeOpenAIRequest({
  request,
  apiKey,
  commandLabel = "atlas exec run",
  fetchImpl = globalThis.fetch,
  endpoint = OPENAI_RESPONSES_URL
}) {
  if (!apiKey) {
    return {
      ok: false,
      status: "failed",
      error: {
        code: "missing_api_key",
        message: `OPENAI_API_KEY is required for \`${commandLabel}\`.`
      }
    };
  }

  if (typeof fetchImpl !== "function") {
    return {
      ok: false,
      status: "failed",
      error: {
        code: "missing_fetch",
        message: "No fetch implementation is available for OpenAI execution."
      }
    };
  }

  const body = {
    model: request.model,
    input: request.input?.promptText || request.prompt || ""
  };

  const startedAt = Date.now();

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    const latencyMs = Date.now() - startedAt;
    const responseBody = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false,
        status: "failed",
        latencyMs,
        error: {
          code: responseBody?.error?.code || `http_${response.status}`,
          message: responseBody?.error?.message || `OpenAI request failed with status ${response.status}.`
        },
        raw: responseBody
      };
    }

    const normalized = normalizeOpenAIResponse(responseBody);
    return {
      ok: normalized.text.trim().length > 0,
      status: normalized.text.trim().length > 0 ? "completed" : "failed",
      latencyMs,
      response: normalized,
      usage: normalizeUsage(responseBody?.usage),
      raw: responseBody,
      error: normalized.text.trim().length > 0
        ? undefined
        : {
            code: "empty_response",
            message: "OpenAI returned no text output."
          }
    };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      latencyMs: Date.now() - startedAt,
      error: {
        code: "network_error",
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

function normalizeOpenAIResponse(response) {
  const text = collectOutputText(response);
  return {
    provider: "openai",
    id: response?.id || null,
    status: response?.status || null,
    finishReason: response?.status || null,
    text
  };
}

function collectOutputText(response) {
  if (typeof response?.output_text === "string" && response.output_text.length > 0) {
    return response.output_text;
  }

  const parts = [];
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== "object") {
    return null;
  }

  return {
    inputTokens: usage.input_tokens ?? null,
    outputTokens: usage.output_tokens ?? null,
    totalTokens: usage.total_tokens ?? null
  };
}

registerExecutionAdapter("openai", executeOpenAIRequest);
