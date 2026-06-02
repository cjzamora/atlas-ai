const adapterRegistry = new Map();
const handoffAdapterRegistry = new Map();

export function registerExecutionAdapter(provider, adapter) {
  adapterRegistry.set(String(provider), adapter);
}

export function registerHandoffAdapter(provider, adapter) {
  handoffAdapterRegistry.set(String(provider), adapter);
}

export async function executeProviderRequest({ provider, request, commandLabel, ...options }) {
  const adapter = adapterRegistry.get(String(provider));
  if (!adapter) {
    return {
      ok: false,
      status: "failed",
      error: {
        code: "unsupported_provider",
        message: `Provider "${provider}" is not supported yet.`,
        retryable: false
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

export async function buildProviderHandoff({ provider, request, commandLabel, ...options }) {
  const adapter = handoffAdapterRegistry.get(String(provider));
  if (!adapter) {
    return {
      ok: false,
      status: "failed",
      error: {
        code: "unsupported_provider",
        message: `Provider "${provider}" does not have a handoff adapter yet.`,
        retryable: false
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
