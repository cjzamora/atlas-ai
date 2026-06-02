// Resolve the provider/model for an execution. Precedence: explicit CLI flags >
// per-repo config defaults (`.atlas/config.json` `model` block) > built-in fallback.
// A config `model` only applies when its provider matches the resolved provider.
export function resolveModelConfig(flags = {}, defaults = {}) {
  const provider = String(flags.provider || defaults.provider || "openai");
  const configModel = defaults.model && (!defaults.provider || defaults.provider === provider)
    ? defaults.model
    : null;
  const fallbackModel = provider === "openai" ? "gpt-5.4" : "default";
  const model = String(flags.model || configModel || fallbackModel);
  return { provider, model };
}
