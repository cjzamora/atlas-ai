# Hybrid Lexical + Vector Retrieval — Design

date: 2026-06-03
status: approved design (pre-implementation)
supersedes: the "eval-before-embeddings" deferral in archive/roadmap-to-atlas-os.md (evolved, not dropped)

## Goal

Make Atlas retrieval generic across languages, structure, and naming **by meaning**, not by
per-language lexical tuning — by adding semantic (vector) retrieval alongside the existing
domain-agnostic lexical engine, fused into one ranking. Keep the kernel local-first, deterministic,
and dependency-light *by default*; the embedder is an opt-in enhancement.

## Non-goals (v1)

- No per-symbol chunking, no API embedder, no ANN index, no re-ranking/query-expansion. All are
  deferred behind seams (below) and gated on eval evidence.
- No change to the public `--json`/artifact contracts (retrieval still returns file-level evidence).

## Evolved discipline: "eval-gated embeddings"

The original "eval-before-embeddings" rule is kept in spirit but evolved, because the current eval
cannot see where embeddings win (its queries are lexically aligned and it has no concept-gap cases):

1. Build embeddings behind an **optional adapter**, shipped **off by default**.
2. Strengthen the eval with **semantics-probing cases** (concept-gap / synonym / paraphrase /
   cross-vocabulary across languages).
3. Run an **A/B** (lexical-only vs hybrid) on that eval. **Promote embeddings to on-by-default only
   if the A/B shows lift.** If lexical holds up, the rule just saved us a dependency.

## Architecture — four seams (future-proof) + minimal implementations

| Seam (build now) | v1 implementation | Future it unlocks (deferred, eval-gated) |
|---|---|---|
| **1. Embedding adapter** `embed(texts)→Float32[][]`, `isAvailable()`, `id/dim/model` | local default (`@huggingface/transformers`, `all-MiniLM-L6-v2`, 384-dim) via lazy `import()`; **optionalDependency**; plus a deterministic **stub** adapter for tests | API embedder, model upgrades |
| **2. Chunk-keyed storage** `embeddings(chunk_id PK, path, kind, ref, model, dim, vector BLOB, content_sha1)` | exactly one row per file: `kind='file'`, `ref=null`, `chunk_id=path` | per-symbol chunks (`kind='symbol'`) — no migration |
| **3. `vectorSearch(queryVec, k)`** | brute-force cosine in JS over stored vectors | ANN index (sqlite-vec/HNSW) — swap behind the function |
| **4. `fuseRankings([{name, ranked}])`** (RRF over a *list* of rankers) | fuse lexical + vector | add a 3rd+ signal (per-symbol, FTS, graph-walk) by appending |

The embedding adapter mirrors the existing execution-adapter registry (`src/adapters/`).

## Components

- `src/adapters/embeddings/index.js` — registry + interface; `registerEmbeddingAdapter`, `getEmbeddingAdapter`, `embeddingAvailable()`.
- `src/adapters/embeddings/local.js` — local model adapter; lazy `import("@huggingface/transformers")`; if import fails → not available.
- `src/adapters/embeddings/stub.js` — deterministic fake-vector adapter for tests (hash text → fixed vector).
- `src/core/embedding-index.js` — build per-file embedding docs (path + summary + symbol names + content excerpt capped to token budget), upsert into the `embeddings` table, incremental via `content_sha1`/`model`.
- `src/core/vector-store.js` — `vectorSearch(dbFile, queryVector, k)` (cosine); read/write float32 blobs.
- `src/core/rank-fusion.js` — `fuseRankings(namedRankedLists, k)` reciprocal rank fusion.
- `src/core/retrieval.js` — `searchEvidence` becomes hybrid: lexical ranking (existing) ⊕ vector ranking (when available) → `fuseRankings`. No adapter/index → lexical-only (unchanged).
- `src/commands/index.js` — after scan, if an embedder is available/enabled, build the embedding index. Config/flag gated.
- `.atlas/config.json` — `embeddings: { enabled: boolean, provider, model }` (read via the config plumbing added for model defaults). Default `enabled: false`.

## Data flow

- **Index:** `scan → upsertFiles → (if enabled & available) build per-file docs → embed in batches → upsert vectors (skip unchanged sha1)`.
- **Query:** `tokenize → lexical ranked list` and, if vectors present, `embed(query) → vectorSearch → vector ranked list` → `fuseRankings([lexical, vector]) → top-K`.

## Error handling / determinism / dependency posture

- Embedder absent or `enabled:false` → graceful **lexical-only** fallback (one-line notice in `--json`/human as `retrieval.mode: "lexical" | "hybrid"`).
- Per-file embed failure → skip that file, keep it lexically searchable; never fail the index.
- Stored `model`/`dim` mismatch vs the active adapter → re-embed those rows.
- Fixed local model ⇒ deterministic vectors; offline once the model is cached.
- `@huggingface/transformers` is an **optionalDependency**, lazy-imported — default `npm install` stays `typescript`-only; the suite never downloads it (uses the stub).

## Eval — the proof

- Add a **semantic eval spec** with concept-gap/synonym/paraphrase cases over the held-out repos (e.g. query "authentication" against code that only says `guard`/`session`; "remove duplicates" vs `dedupe`; cross-language meaning matches).
- Add an **A/B harness** to `eval retrieval`: run lexical-only and hybrid, report both hit-rates/avg-ranks and the **lift**. This is the number that gates default-on.
- Existing held-out specs remain the regression guard (must not regress under hybrid).

## Testing

- **Stub embedder** (deterministic) registered in tests → `npm test` needs no model, stays fast/offline.
- Unit tests: cosine, RRF, `vectorSearch`, incremental re-embed (sha1), lexical-fallback when no adapter, hybrid ordering with the stub.
- A/B eval test runs with the stub to validate the harness (the *real* lift is measured by the user locally with the model installed — documented as a runtime step).

## Done-when

- `searchEvidence` is hybrid behind the seams; lexical-only path byte-identical when embeddings off.
- `npm test` green with the stub; no new default dependency.
- `eval retrieval --ab` reports lexical-vs-hybrid lift on the strengthened semantic eval.
- Docs updated (README, roadmap) and a clear default-on/off recommendation recorded once the A/B is run.

## Deferred (eval-gated triggers)

- Per-symbol chunks — when large-file coarseness shows in the eval.
- API embedder — when hosted quality is wanted.
- ANN index — when brute-force cosine is too slow on a real large repo.
- Re-rank / query expansion / multi-model — on eval plateau.

## Open question

- Default local model: `all-MiniLM-L6-v2` (general, 384-dim, ~23MB) vs a code-specialized model
  (larger). Recommendation: start with MiniLM (small, proven); let the A/B decide if a code model is
  worth the size.
