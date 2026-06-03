import { registerEmbeddingAdapter } from "./index.js";

// Deterministic, dependency-free embedding adapter for tests and offline demos.
//
// It is NOT a real model — it fakes just enough "semantic" behaviour to exercise
// the pipeline and the A/B eval: a few concept clusters map synonyms onto shared
// dimensions (so a query and a lexically-disjoint file about the same concept land
// near each other), plus a hashed bag-of-words component for everything else.
// The clusters live here in the test double, never in the kernel.
const DIM = 48;

const CONCEPT_CLUSTERS = {
  0: ["auth", "authentication", "authenticate", "authorize", "guard", "session", "login", "credential", "token", "identity"],
  1: ["cache", "caching", "ttl", "evict", "eviction", "expire", "memoize", "store"],
  2: ["parse", "parser", "parsing", "tokenize", "lexer", "lex", "syntax", "ast", "grammar"],
  3: ["retry", "backoff", "requeue", "redeliver", "resend", "reattempt"],
  4: ["dedupe", "deduplicate", "unique", "distinct", "duplicate"],
  5: ["schedule", "scheduler", "cron", "queue", "enqueue", "dispatch", "worker", "job"]
};

const wordToCluster = new Map();
for (const [dimension, words] of Object.entries(CONCEPT_CLUSTERS)) {
  for (const word of words) {
    wordToCluster.set(word, Number(dimension));
  }
}

function hashToken(token) {
  let hash = 5381;
  for (let index = 0; index < token.length; index += 1) {
    hash = ((hash << 5) + hash + token.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function embedOne(text) {
  const vector = new Array(DIM).fill(0);
  const tokens = String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);

  const clusterDimensions = Object.keys(CONCEPT_CLUSTERS).length;
  for (const token of tokens) {
    if (wordToCluster.has(token)) {
      vector[wordToCluster.get(token)] += 3; // concept signal dominates
    }
    const bucket = clusterDimensions + (hashToken(token) % (DIM - clusterDimensions));
    vector[bucket] += 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm === 0 ? vector : vector.map((value) => value / norm);
}

export const stubEmbeddingAdapter = {
  id: "stub",
  model: "stub-concept-v1",
  dim: DIM,
  async isAvailable() {
    return true;
  },
  async embed(texts) {
    return texts.map((text) => embedOne(text));
  }
};

registerEmbeddingAdapter("stub", stubEmbeddingAdapter);
