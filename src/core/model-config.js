export function resolveModelConfig(flags = {}) {
  const provider = String(flags.provider || "openai");
  return {
    provider,
    model: String(flags.model || (provider === "openai" ? "gpt-5.4" : "default"))
  };
}
