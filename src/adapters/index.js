const adapterRegistry = new Map();

export function registerExecutionAdapter(provider, adapter) {
  adapterRegistry.set(String(provider), adapter);
}

export async function executeProviderRequest({ provider, request, commandLabel, ...options }) {
  const adapter = adapterRegistry.get(String(provider));
  if (!adapter) {
    return {
      ok: false,
      status: "failed",
      error: {
        code: "unsupported_provider",
        message: `Provider "${provider}" is not supported yet.`
      }
    };
  }

  return adapter({
    provider,
    request,
    commandLabel,
    ...options
  });
}
