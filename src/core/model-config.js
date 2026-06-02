export function resolveModelConfig(flags = {}) {
  return {
    provider: String(flags.provider || "openai"),
    model: String(flags.model || "gpt-5.4")
  };
}
