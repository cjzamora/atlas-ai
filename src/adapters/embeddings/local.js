import { registerEmbeddingAdapter } from "./index.js";

// Optional local embedding adapter. Lazy-imports `@huggingface/transformers`
// (an optionalDependency) and runs a small model entirely on-device, so the kernel
// stays offline + deterministic. If the package isn't installed, isAvailable()
// returns false and retrieval falls back to lexical-only — the default install
// remains dependency-light.
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const DIM = 384;

let extractorPromise = null;
let unavailable = false;

async function loadExtractor() {
  if (unavailable) {
    return null;
  }
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const transformers = await import("@huggingface/transformers");
      const { pipeline, env } = transformers;
      // Stay offline/deterministic once cached; no telemetry.
      if (env) {
        env.allowRemoteModels = env.allowRemoteModels ?? true;
      }
      return pipeline("feature-extraction", MODEL_ID);
    })().catch(() => {
      unavailable = true;
      return null;
    });
  }
  return extractorPromise;
}

export const localEmbeddingAdapter = {
  id: "local",
  model: MODEL_ID,
  dim: DIM,
  async isAvailable() {
    const extractor = await loadExtractor();
    return Boolean(extractor);
  },
  async embed(texts) {
    const extractor = await loadExtractor();
    if (!extractor) {
      throw new Error("Local embedding model is not available.");
    }
    const vectors = [];
    for (const text of texts) {
      const output = await extractor(text, { pooling: "mean", normalize: true });
      vectors.push(Array.from(output.data));
    }
    return vectors;
  }
};

registerEmbeddingAdapter("local", localEmbeddingAdapter);
