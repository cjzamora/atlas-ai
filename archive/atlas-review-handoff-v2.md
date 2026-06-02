---
title: Atlas — External Review Handoff (v2)
source: External code review (Claude)
review_date: 2026-06-02
supersedes: atlas-review-handoff.md (v1, README-level)
status: advisory — opinion/analysis; confirm each item against the named file before acting
scope: Full source review of latest main (src/core, src/validation, src/adapters)
---

# Atlas — External Review Handoff (v2)

## How to use this document

This supersedes v1 (which was a README-level pass). It is a source-level review of the
latest `main`. Sections:

1. **Resolved since v1** — do not redo these; verify and close.
2. **Strengths to preserve** — do not regress.
3. **Open items** — carried from v1, still present in code.
4. **New findings** — surfaced only once the source was read.
5. **Prioritized roadmap (P0/P1/P2)** — actionable, with file/function anchors and "done-when".

Each item names the file and function it refers to so tasks can be scoped tightly.
Items tagged **[safety]** affect correctness of confirmed patches; **[integrity]**
affects whether the eval harness still measures generalization.

---

## Context snapshot

Atlas is a local-first CLI that owns the layers before a model edits code: scan/index,
symbol + dependency graph, retrieval, deterministic planning, impacted-test selection,
context bundles, and a patch lifecycle (stage → validate → apply → confirm → rollback).
Models are pluggable execution adapters behind a normalized request/response contract.
Latest main adds a formal adapter registry (`src/adapters/`), a live OpenAI adapter,
distance-aware impacted-test selection, and binding-aware call resolution.

---

## 1. Resolved since v1 (verify and close)

- **[safety] Unbounded impacted-set BFS — FIXED.**
  `expandImpactedPaths` (`src/validation/test-selection.js`) now bounds traversal to
  depth 2 and tracks per-node `distance`. Distance now drives scoring
  (`scoreCoverageContribution` applies `distance * 12`; `scoreDirectCoverageMatch` decays
  distant matches; seeds are boosted). Test files are excluded from expansion. A
  `specificityPenalty` and a fewer-`covers` tie-break now favor targeted tests.
- **Filename-stem coverage match — ADDED.** `scoreDirectCoverageMatch` scores
  `foo.test.js` ↔ `foo.js` (`+45`), giving a graph-independent route to the right test
  when an edge is missing. Good defensive layer; keep it.
- **Call resolution precision — IMPROVED.** `resolveCallEntry` (`src/core/scanner.js`)
  now attempts binding-aware resolution (receiver via imported-symbol binding) before
  falling back to the name index. (Residual ambiguity remains — see New findings.)
- **Memory transparency — IMPROVED.** `buildMemoryBoosts` now reports
  `ignoredPatternCount` / `ignoredOutcomes`, so non-confirmed patterns that were skipped
  are visible in `memoryAssistance`.
- **Adapter seam — FORMALIZED.** `src/adapters/index.js` cleanly separates
  `registerExecutionAdapter` (live) from `registerHandoffAdapter` (manual), with a live
  OpenAI adapter (`executeOpenAIRequest`) shipping. Structure is ready for live
  Codex/Claude adapters.

---

## 2. Strengths to preserve (do not regress)

- Underneath-the-platform architecture: models as swappable adapters, durable
  intelligence (graph, retrieval, planning, patch lifecycle, memory) kept local and
  deterministic.
- Graph-aware retrieval scoring in `retrieval.js` (1-hop neighbor signals, not pure lexical).
- Planner honesty: `validationStrategy` labels `graph` vs `heuristic` mode and separates
  `directTests` from `expandedTests`, surfacing when it is guessing.
- Eval-before-embeddings discipline and explicit deferral of semantic retrieval / team memory.
- Distance-aware, specificity-aware impacted-test selection (new in this version).

---

## 3. Open items (carried from v1, still in code)

- **[quality] Context bundle is head-truncation.** `compressContent`
  (`src/core/context-builder.js`) still slices the first `maxCharsPerFile` (1400) chars
  and appends `...`. It sends the top of each file regardless of where the matched symbol
  lives, so the model can receive imports/boilerplate instead of the relevant code. This
  does not show up in retrieval eval. Needs symbol-aware windowing.
- **[automation] Codex/Claude round-trip is still manual.** Live execution exists only
  for the OpenAI API; `src/adapters/codex.js` and `src/adapters/claude.js` are
  handoff-only (`mode: "manual"`). The execution registry is ready to host live
  headless-CLI adapters; they are not wired yet. This is the gap between current state
  and the stated speed goal.

---

## 4. New findings (source-level)

- **[integrity] Ranking is overfit to one codebase shape.** `profileQuery` and
  `scoreImplementationRole` (`src/validation/test-selection.js`) hardcode domain
  vocabulary (`payments`, `checkout`, `charges`, `inngest`, `guard`, `mapper`, ...) and
  NestJS-style file-suffix conventions (`.service.ts +10`, `.mapper.ts +30`, `.guard.ts`,
  `dashboard-` penalty). On repos matching these conventions this ranks well; elsewhere it
  is dead weight or wrong. More importantly, if these constants were tuned to pass
  retrieval-eval cases, the harness is now partly measuring memorized answers rather than
  a general ranker, so it can no longer detect whether the ranking model generalizes.
- **[safety] New depth-2 cutoff tradeoff.** Bounding `expandImpactedPaths` to 2 hops
  retired the explosion risk but introduced a recall gap: genuinely impacted files 3+ hops
  away (through thin wrapper chains) are now invisible to graph-based selection. The
  filename-stem match only compensates when naming conventions hold.
- **Residual call-resolution ambiguity.** The name-index fallback in `resolveCallEntry`
  picks the first external owner when several files export the same-named symbol, which
  can create a false edge. Lower risk now that it is a fallback, but still a source of
  graph noise feeding test selection.
- **Magic-number volume has grown.** Scoring constants are now numerous and
  domain-coupled across `retrieval.js` and `test-selection.js`. Extracting them to config
  has shifted from nice-to-have to a prerequisite for honest evaluation (see P0.5).

---

## 5. Prioritized roadmap (P0/P1/P2)

### P0

1. **[integrity] Separate general ranking from domain heuristics; add held-out eval repos.**
   - What: split scoring into (a) general signals — lexical, graph-distance, stem-match —
     in core, and (b) domain heuristics (suffix/vocab) loaded as optional per-repo config,
     not baked into `test-selection.js`. Add at least one held-out eval repo with
     different conventions than the tuning fixtures.
   - Done when: core ranking runs with domain config disabled and still passes a baseline;
     the eval harness reports scores on a held-out repo the constants were not tuned against.

2. **[quality] Symbol-aware context windowing.**
   - What: replace head-truncation in `compressContent` with excerpts centered on matched
     symbols / lines (use the evidence match's symbol and the file's symbol offsets).
   - Done when: for a target symbol past the first 1400 chars, the bundle excerpt contains
     that symbol's region rather than the file head; verified on a fixture case.

3. **[automation] Live Codex/Claude headless adapters.**
   - What: register live execution adapters (`registerExecutionAdapter("codex", ...)`,
     `"claude"`) that invoke the headless CLIs (`codex exec`, `claude -p`) using the
     existing normalized request, returning the normalized response shape.
   - Done when: `atlas fix "<task>" --provider codex` completes stage → execute → test →
     confirm with no manual paste, and the manual handoff path still works as fallback.

### P1

4. **[safety] Full-suite miss-rate harness for impacted-test selection.**
   - What: add a mode that runs the full suite alongside the selected subset and records
     how often a full-suite failure was missed. This also quantifies the new depth-2
     recall tradeoff.
   - Done when: runs can emit a miss-rate metric and the run ledger surfaces a rolling
     miss-rate as the trust level of the confirm step.

5. **Extract scoring weights to config.**
   - What: move the now-numerous scoring constants in `retrieval.js` and
     `test-selection.js` into a config object the eval harness can sweep.
   - Done when: weights are read from config and `eval retrieval` can run a sweep without
     code edits.

6. **Memory decay + eval validation.**
   - What: add recency/decay to additive memory boosts (`buildMemoryBoosts`) so recurring
     themes do not entrench indefinitely; run retrieval eval with memory on vs off.
   - Done when: a reproducible report shows whether memory raises hit rate (learning) or
     reshuffles it (drift), with a regression alert on degradation.

### P2

7. **Reduce residual call-resolution ambiguity.**
   - What: when the name-index fallback in `resolveCallEntry` has multiple external owners,
     prefer disambiguation by import binding / proximity over first-match, or mark the edge
     low-confidence.
   - Done when: ambiguous fallbacks are either disambiguated or flagged so they can be
     down-weighted in expansion.

8. **Retrieval scaling: FTS5 before embeddings.**
   - What: `retrieval.js` full-scans all files and scores in JS per query. Add SQLite FTS5
     as the lexical index step before any semantic retrieval work.
   - Done when: retrieval no longer requires a full table scan per query on a large repo,
     with no regression on the JS/TS eval baseline.

9. **Harden task classification and close the cost-routing loop.**
   - What: `classifyTask` (`planner.js`) is brittle substring matching and `modelRecommendation`
     is coarse and unwired. Improve classification and route mechanical vs hard tasks to
     cheaper vs frontier models, recording routing in the run ledger.
   - Done when: `cost report` reflects routing decisions and shows cost delta vs a
     single-model baseline.

---

## Strategic note

The depth-bounding and binding-aware call resolution retired most of the confirm-step
risk that dominated v1. The frontier has moved: the open question is no longer "is the
graph trustworthy" but "does the ranker generalize beyond the repo it was tuned on."
Keep investing in the deterministic, verifiable, provider-neutral core (graph,
distance-aware selection, patch lifecycle, cost accounting); push domain-specific tuning
out of core and into per-repo config so the eval harness keeps measuring generalization
rather than memorization.
