---
title: Atlas v0 — External Review Handoff
source: External architecture review (Claude)
review_date: 2026-06-02
status: advisory — opinion/analysis, not verified against source code
scope: Based on README.md at github.com/cjzamora/atlas-ai (v0)
---

# Atlas v0 — External Review Handoff

## How to use this document

This is an advisory review of Atlas v0 intended to be folded into the roadmap.
It is organized into four parts:

1. **Strengths to preserve** — design decisions that should not regress.
2. **Weaknesses & gaps to address** — concrete shortfalls with fixes.
3. **Risks to monitor** — things that look safe but can fail quietly.
4. **Prioritized roadmap recommendations** — actionable items with "done-when" criteria.

Caveat: this review is based on the README only, not the source. Treat each
item as a hypothesis to confirm against the code before acting. Items marked
**[safety]** affect correctness of confirmed patches and should be validated first.

---

## Context snapshot (for the reader)

Atlas is a local-first, dependency-light CLI that owns the layers *before* a coding
model edits code: repo scanning/indexing, symbol + dependency graph, retrieval-backed
QA, deterministic planning, impacted-test selection, compact context bundles, and a
patch lifecycle (stage → validate → apply → confirm → rollback). Models (Codex, Claude)
are treated as **swappable execution adapters** behind a normalized request/response
contract. Memory is advisory: confirmed/rolled-back fix runs feed confidence-weighted
hints back into planning, retrieval, and ranking. Semantic embeddings and team memory
are deliberately deferred.

---

## 1. Strengths to preserve (do not regress)

- **Underneath-the-platform architecture.** Treating models as interchangeable
  execution adapters and keeping the durable intelligence (graph, retrieval, planning,
  patch lifecycle, memory) in a deterministic local kernel is the strongest strategic
  choice in the project. It is more defensible than building on top of vendor primitives.
- **Pre-edit layer built first.** The high-leverage, unglamorous work (context assembly,
  graph, planning) was prioritized over orchestration theater. Keep this ordering.
- **Determinism discipline.** Deterministic planning, validated unified-diff application,
  snapshot-based rollback, review-only staging. The model is the only stochastic
  component and it is quarantined behind a normalized contract. Preserve this boundary.
- **Eval-before-embeddings.** `eval retrieval --fail-under 0.8` gating semantic retrieval
  on demonstrated lexical-retrieval failure is rare maturity. Do not add embeddings on
  reflex; let the harness justify it.
- **Scope discipline.** Explicit "not implemented" / "deferred" sections with reasons.
  This conviction-driven scoping is a project strength — protect it.

---

## 2. Weaknesses & gaps to address

- **Manual round-trip is the speed ceiling.** prepare → handoff → paste → import → test
  → apply puts a human at the slowest point in the pipeline. The seam is correctly
  designed (normalized execution request + adapter seam), but value only compounds once
  it is automated against headless CLIs (`codex exec`, `claude -p`). This is the single
  biggest gap between current state and the stated speed goal.
- **Graph quality degrades outside JS/TS.** The dependency graph drives both
  impacted-test selection and retrieval ranking, but falls back to heuristics for
  non-JS/TS files. This is a silent quality cliff. (tree-sitter would buy multi-language
  AST graphs relatively cheaply if breadth becomes a priority.)
- **Cost report is observability, not control.** Token metrics and a cost report exist,
  but they do not yet feed routing decisions. "Cost-aware" is only half-realized until
  task classification drives model selection (cheap model for mechanical edits, frontier
  model for hard planning).

---

## 3. Risks to monitor

- **[safety] Impacted-test selection trusts graph completeness.** The confirm step
  ("rerun selected tests") is only as sound as the graph. Missed edges — dynamic imports,
  DI wiring, reflection, runtime monkeypatching, config-driven dispatch — cause too few
  tests to run, leading to confident confirmation of a broken patch. The existing eval
  measures recall against a *labeled spec*, which does not capture graph gaps in the wild.
- **Memory feedback loop can self-reinforce.** Advisory prior-pattern hints that boost
  retrieval/ranking can entrench a local optimum: past fixes bias retrieval toward the
  same files, biasing the next fix toward the same files. Dedup + confidence-weighting
  mitigate but do not detect the loop.
- **Retrieval defensibility erodes over time.** Generic lexical retrieval and "compact
  context bundles" compete directly with vendor retrieval + large context windows, which
  the model providers are actively improving. The graph, impacted-test selection,
  deterministic patch lifecycle, and cost accounting are the durable moat; raw retrieval
  is less defensible. Use the eval harness as the referee.

---

## 4. Prioritized roadmap recommendations

### P0 — highest leverage / safety

1. **Automate the execution round-trip against headless CLIs.**
   - What: add live adapters that invoke `codex exec` and `claude -p` using the existing
     normalized execution request, removing the manual paste/import step for trusted runs.
   - Done when: `atlas fix "<task>"` can complete a full stage→execute→test→confirm cycle
     with no human paste, and the manual handoff/import path still works as a fallback.

2. **[safety] Measure impacted-test miss rate against the full suite.**
   - What: add a mode that periodically runs the full test suite alongside the selected
     subset and records how often a full-suite failure was missed by selection.
   - Done when: each `fix`/`test` run can emit a miss-rate metric, and the run ledger
     surfaces a rolling miss-rate as the trust level of the confirm step.

### P1 — quality and cost loop

3. **Validate memory through the eval harness.**
   - What: run retrieval eval with memory hints on vs off and compare evidence/impacted
     hit rates.
   - Done when: there is a reproducible report showing whether memory *raises* hit rate
     (learning) or merely *reshuffles* it (drift); regression alerts if it degrades.

4. **Close the cost loop with task-classified model routing.**
   - What: classify task difficulty and route mechanical edits to a cheaper model and
     hard planning to a frontier model; record routing decisions in the run ledger.
   - Done when: `cost report` reflects routing decisions and shows cost delta vs a
     single-model baseline.

### P2 — breadth and durability

5. **Multi-language graph via tree-sitter (only if breadth is needed).**
   - Done when: at least one non-JS/TS language has AST-backed (not heuristic) graph edges,
     and the retrieval eval confirms no regression on the JS/TS baseline.

6. **Retrieval defensibility check.**
   - What: periodically benchmark Atlas lexical retrieval vs model-native retrieval +
     large-window context on real repos.
   - Done when: there is a documented decision rule for when to cede retrieval to the
     model and concentrate effort on the deterministic/verifiable moat.

---

## Strategic note

Atlas's durable advantage is the **deterministic, inspectable, reproducible,
provider-neutral** version of capabilities the platforms offer opaquely. Where Atlas
can be *better because it is verifiable* (graph, impacted-test selection, patch
lifecycle, cost accounting), invest. Where Atlas merely *reimplements* what vendors give
away and improve faster (raw retrieval, context packing), be willing to defer or cede —
and let the eval harness, not intuition, make that call.
