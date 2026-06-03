// Embedding-adapter seam (seam #1 of the hybrid-retrieval design), mirroring the
// execution-adapter registry. An adapter is:
//   { id, model, dim, isAvailable(): Promise<boolean>, embed(texts): Promise<number[][]> }
// Retrieval/indexing depend only on this interface, so the local model can be
// swapped for an API embedder later without touching them.
const embeddingAdapters = new Map();

export function registerEmbeddingAdapter(id, adapter) {
  embeddingAdapters.set(String(id), adapter);
}

export function getEmbeddingAdapter(id) {
  return embeddingAdapters.get(String(id)) || null;
}

export function listEmbeddingAdapters() {
  return [...embeddingAdapters.keys()];
}

// Returns the configured adapter if embeddings are enabled AND the adapter reports
// itself available (e.g. the local model/runtime is actually installed); otherwise
// null, so callers fall back to lexical-only retrieval.
export async function resolveEmbeddingAdapter(config = {}) {
  if (!config || !config.enabled) {
    return null;
  }
  const adapter = embeddingAdapters.get(String(config.provider || "local"));
  if (!adapter) {
    return null;
  }
  try {
    if (typeof adapter.isAvailable === "function" && !(await adapter.isAvailable())) {
      return null;
    }
  } catch {
    return null;
  }
  return adapter;
}
