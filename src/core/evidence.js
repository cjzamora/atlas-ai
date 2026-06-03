import { hybridSearchEvidence } from "./retrieval.js";
import { resolveEmbeddingAdapter } from "../adapters/embeddings/index.js";
import "../adapters/embeddings/local.js";

// Shared retrieval entry point for command handlers. Resolves the embedding adapter
// from runtime config and runs hybrid retrieval; when embeddings are off or no
// embedder is available it transparently degrades to lexical-only. Returns the
// same { matches, memoryAssistance } shape commands already consume (plus `mode`).
export async function retrieveEvidence({ runtime, query, limit }) {
  const adapter = await resolveEmbeddingAdapter(runtime.config?.embeddings);
  return hybridSearchEvidence(runtime.paths.dbFile, query, limit, adapter);
}
