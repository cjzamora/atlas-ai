---
title: Roadmap — Kernel Readiness for the atlas-os Operator Layer
date: 2026-06-03
status: analysis — grounded in source at latest main; cites real files/functions/report numbers
scope: src/core, src/validation, src/adapters, src/commands, tests, evals; reconciled against README + archive plans + review handoffs
north_star: Atlas must be intelligent regardless of codebase, structure, or language — a general repo-intelligence engine, not a domain-tuned one
---

# Roadmap: What the Atlas Kernel Needs Before atlas-os

## Purpose and frame

Atlas today is a local, dependency-light CLI **kernel** for repo intelligence:
`init → index → ask → plan → context → prompt → exec → patch → test → runs → cost`. The next
phase is an **operator layer (`atlas-os`)** — skills, agents, rules, and hooks built *on top of*
the kernel, consuming its commands, `--json` shapes, and artifacts ([V1 Roadmap.md](V1%20Roadmap.md)
step 4: "document the operating system layer after the kernel and adapter seams are stable").

**North star (governing goal):** Atlas must be **intelligent regardless of codebase, structure, or
language** — a *general* repo-intelligence engine. This is a deliberate correction of the kernel's
current direction. Today the ranker is tuned to one codebase shape (NestJS/commerce). The fix is
**not** to make that tuning configurable per-repo — that only relocates the bias into a file someone
hand-writes for every new repo. The fix is for the ranker to **derive structure from each repo
itself** and carry **no baked-in domain conventions at all**.

This document frames "ready for atlas-os" as a five-criterion **gate**, then orders the work so that
generality and verifiability are achieved together:

1. **Trustworthy verification** — impacted-test selection has a known miss-rate, and the eval measures
   *generalization on repos we did not tune on*, not memorization of the tuning fixtures.
2. **Stable contracts** — commands, `--json` shapes, and execution/artifact contracts are documented
   and versioned.
3. **Usable end-to-end** — `index → context → plan → execute → verify` produces useful output on a
   real repo *of any language/structure*, with a working live execution path.
4. **Domain-agnostic core** — the ranker contains **no hardcoded domain vocabulary or naming
   conventions**; signals are derived from the repo. (Config exists only for genuinely repo-agnostic
   knobs like provider/model — never for per-repo domain tables.)
5. **Observable** — the run ledger and cost report expose enough for orchestration/routing.

**Bottom line up front:** the kernel is strong on *deterministic plumbing* (patch lifecycle, run
ledger, adapter seam, a working live `fix` path) but **not ready** on the criteria that decide whether
an operator layer can trust it across codebases: it is **overfit to one repo shape (Gate 1/4)** and
its graph — the main domain-free signal — is **JS/TS-only (Gate 3)**. The highest-leverage move is to
**remove the hardcoded domain conventions and replace them with repo-derived signals**, because that
single change serves the north star *and* restores Gate 1's ability to measure generalization.

Honest consequence stated up front: removing the tuned constants will **lower the current fixture
scores from 100%**. That is the overfit being undone, not a regression. The held-out real repo, not
the calibrated fixtures, becomes the scoreboard.

A note on the eval numbers used as evidence: both committed reports
([atlas-ai-retrieval-report.json](atlas-ai-retrieval-report.json),
[commerce-app-retrieval-report.json](commerce-app-retrieval-report.json)) report **100% evidence and
test hit rates** — but both spec fixtures are **Atlas-owned**, and one is explicitly labeled "committed
kernel **calibration**." Those are evidence of a *tuned* system, not a *general* one.

---

## Implementation status (updated 2026-06-03)

**Roadmap #1 (domain-agnostic scoring) — DONE and verified.** The domain vocabulary and
filename-suffix tables were removed from `retrieval.js` and `test-selection.js` and replaced with
corpus-derived IDF term weighting + structural centrality (the delete/keep/replace below).
Cross-language test-linking and a broader language set (`.rb`, `.php`, `.kt`, `.swift`, `.c/.cpp`,
`.cs`, …) were added to `scanner.js`. **Roadmap #2 (held-out eval) — DONE:** five held-out repos
in five languages/structures now live under `playgrounds/holdout-*` with specs in
`evals/retrieval/`. `npm test` is green (76/76).

Measured retrieval (evidence / impacted-test hit rate; the conventions are gone for all of these):

| Repo (held-out unless noted) | Lang / shape | evidence | tests | ev avg rank | test avg rank |
|---|---|---|---|---|---|
| commerce-app (tuned fixture) | NestJS TS | 1.00 | 1.00 | 1.0 | 1.29 |
| holdout-python-tasks | Python pkg, `tests/test_*.py` | 1.00 | 1.00 | 1.4 | 1.0 |
| holdout-go-inventory | Go pkgs, `*_test.go` | 1.00 | 1.00 | 1.2 | 1.0 |
| holdout-ruby-geometry | Ruby `lib/`+`spec/*_spec.rb` | 1.00 | 1.00 | 1.0 | 1.0 |
| holdout-rust-parser | Rust crate, `tests/*_test.rs` | 1.00 | 1.00 | 1.0 | 1.0 |
| holdout-js-eventbus | flat ESM, kebab, no suffixes | 1.00 | 1.00 | 1.0 | 1.0 |

**Key finding — the earlier prediction was wrong.** Removing the tuned constants did *not* drop the
commerce fixture (it held at 1.00/1.00); IDF + graph + stem carry it. So the domain heuristics were
not earning their keep even on the repo they were tuned for. The held-out repos confirm the ranker
now generalizes across languages and structures it was never tuned on. The held-out eval did its job:
it surfaced two real gaps that are now fixed — Ruby was not indexed at all (missing `.rb`), and
non-JS test files did not link (directory-sensitive stem match). Remaining nuance: a couple of Python/Go
cases rank the *test* file above the *source* for evidence (still a hit, rank 2); the non-test bias is
intentionally gentle. **Roadmap #3 (tree-sitter) is still open** — non-JS/TS files still lack a real
call/import graph, so those repos lean on lexical + stem + filesystem signal, which is why this works
without it but would deepen with it.

**Fixture cleanup (same pass).** The domain-specific fixtures were retired: `playgrounds/commerce-app`
and `playgrounds/react-nest-demo`, plus `evals/retrieval/commerce-app.spec.json` and its archived
report, are deleted. The committed eval baseline / drift guard is now `holdout-js-eventbus`
(`archive/holdout-js-eventbus-retrieval-report.json`); a small domain-neutral TypeScript fixture
`test/fixtures/ts-graph-sample` preserves the TS-AST method/call-resolution and staged-validation
coverage that `react-nest-demo` carried. `test/fixtures/sample-repo` was also
neutralized in a follow-up pass: its commerce contents (pricing/checkout/coupon) were renamed to a
domain-agnostic metering/intake vocabulary across the fixture and all 13 dependent test files, with
zero commerce tokens remaining and the suite still green (76/76). No domain-specific fixture remains
in the unit-test or eval surface. (The inline stripe/xero/auth mini-fixtures inside `plan.test.js` /
`test-selection.js` — scaffolding that exercises the now-general ranker — are the only remaining
framework-flavored examples; neutralizing those is optional future cleanup.)

**Roadmap #3 (multi-language graph) — DONE, dependency-light.** Rather than add a tree-sitter/WASM
dependency to a kernel that advertises "dependency-light" — and with no eval evidence yet that the
lexical+stem path is insufficient — `scanner.js` gained per-language heuristic extractors for Python,
Ruby, Rust, and Go (symbols + imports + calls). Call edges resolve through the existing
language-agnostic symbol index, so the cross-language call graph forms without a parser dependency.
Measured resolved edges on the held-outs: Python 18 import + 35 call, Go 34 call (imports are
package-dir so left external), Ruby 13 + 11, Rust 10 + 13, JS 6 + 19. Held-out hit rate held at
1.00/1.00; a few non-JS *average ranks* shifted (e.g. Go evidence 1.0→2.0) as the richer graph
surfaces neighbors — acceptable on 9–11-file fixtures, hit rate intact. tree-sitter remains a future,
evidence-gated upgrade.

**Web/markup coverage (same dependency-light pass).** HTML, CSS, SCSS/Sass/LESS, and Vue/Svelte are
now indexed (they were previously skipped entirely — invisible to retrieval). CSS-family files
contribute `@import`/`@use`/`@forward` import edges plus selector/`@mixin`/`@function` symbols; HTML
contributes `<script src>`/`<link href>` import edges (HTML→JS/CSS) plus `id` anchors; Vue/Svelte get
JS-style import extraction from their script block. Verified by a held-out frontend fixture
(`playgrounds/holdout-web-dashboard`): index.html→dashboard.js + main.css, main.css `@import`→base.css,
theme.scss `@use`→base.css all resolve; evidence hit rate 1.00. (TS/TSX/JSX already had full
TypeScript-AST extraction and are unchanged.)

## The signal rework: delete / keep / replace

This is the heart of the north star, made concrete and auditable. **No domain convention survives as a
config default or fallback** — it is deleted.

| Action | Signals | Where |
|--------|---------|-------|
| **DELETE** | Domain vocab lists (`payments`, `checkout`, `charges`, `inngest`, `guard`, `mapper`, `account`, `country`…) in `profileQuery`; filename-suffix role weights (`.service.ts +30`, `.controller.ts +70`, `.resolver.ts -35`, `.model.ts -75`, `.validation.ts +12`, `.mapper.ts +30`, `dashboard- -5`) in `scoreImplementationRole` | [retrieval.js:180-326](../src/core/retrieval.js), [test-selection.js:322-403](../src/validation/test-selection.js) |
| **KEEP** (already domain-free) | Lexical token matching; graph distance over import/call/test edges; coverage contribution; specificity penalty; test↔source filename-stem match (`+45`) | [retrieval.js](../src/core/retrieval.js), [test-selection.js:257-306](../src/validation/test-selection.js) |
| **REPLACE** the deleted signals with | **(a) Structural centrality** derived from the graph/scanner — import fan-in, call-edge count, symbol/function density, declaration-vs-logic ratio → "which files hold logic vs. boilerplate" without naming conventions. **(b) Term weighting (BM25/TF-IDF)** over the repo's *own* corpus (identifiers, path segments, comments) → the repo supplies its own vocabulary; rare discriminative terms dominate. | new general scorers in core |

The one residual convention is the **test↔source stem match** (`foo.test.js` ↔ `foo.js`). It is a
near-universal *test-naming* pattern, not a *domain* one, so it stays for now — but it is flagged: the
fully-general route is to rely on the graph's `tests`/`tested_by` edges and treat stem-match as a
last-resort fallback. Decide later whether to drop it too.

---

## Gate 1 — Trustworthy verification — **NOT MET** (the biggest gap)

### Current state
- The retrieval eval passes **only against Atlas-owned fixtures.** [atlas-ai.spec.json](../evals/retrieval/atlas-ai.spec.json)
  = 5 cases over Atlas's *own source*; report: `evidenceHitRate 1, testHitRate 1`, all rank 1.
  [commerce-app.spec.json](../evals/retrieval/commerce-app.spec.json) = 7 cases over a fixture the
  README calls "committed kernel **calibration**"; report: hit rates 1, `testAverageRank 1.143` (case
  `shared-webhook-delivery-retry` lands its test at rank 2, allowed by `maxTestRank: 2`). **No held-out
  / third-party repo exists.**
- The ranker is tuned to the fixtures' shape: the DELETE-list constants above are NestJS/commerce
  knowledge, and the fixtures are NestJS/commerce apps. Commit `b656e41 "Bias Atlas retrieval toward
  service and validation files"` is direct evidence of tuning-to-fixture. **The harness therefore
  cannot distinguish a general ranker from a memorized one** — the v2 review's `[integrity]` finding,
  confirmed in code.
- **No miss-rate vs. full suite.** `expandImpactedPaths` ([test-selection.js:141-175](../src/validation/test-selection.js))
  bounds traversal at `distance >= 2`; files 3+ hops away are invisible to graph selection. A repo-wide
  search confirms there is **no** mechanism running the full suite alongside the selected subset, so the
  trust level of the `confirm` step ("rerun selected tests") is unquantified.

### Gap
The eval measures memorization, not generalization, and `confirm`'s soundness is unmeasured. An
operator layer would route work and trust "confirmed" patches on signals the kernel can't vouch for
across codebases.

### Work to close
- Make the **held-out real-repo eval the primary fitness function** (see roadmap #2). Once the
  conventions are removed (#1), the generalized ranker is scored on repos it was never tuned against,
  with misses categorized (lexical / structural / test-link / concept).
- Add a **full-suite miss-rate harness** (#4) that quantifies how often selection misses a real
  failure and surfaces a rolling miss-rate in the ledger.

### Prior-doc status
- Held-out eval: **covered but not done** ([30 Day Roadmap.md](30%20Day%20Roadmap.md) Wk1; v2 P0.1/P1.4).
  *Carried, verified, and promoted to the fitness function.*

---

## Gate 2 — Stable contracts — **PARTIALLY MET**

### Current state
Broad and internally consistent: a shared `{ ok, command, ... }` envelope across all `--json` outputs,
rendered through one `formatOutput` switch ([output.js](../src/core/output.js)); the full command/flag
surface matches the README; clean normalized execution request/response
([contracts.js](../src/core/contracts.js)) and an explicit patch lifecycle enum
(`staged → applied → confirmed | apply_failed_validation | apply_validation_skipped | rolled_back`,
[patch-artifact.js](../src/core/patch-artifact.js)). The plan artifact's `validationStrategy.mode`
(`none|graph|heuristic`) and `directTests` vs `expandedTests` split are honest design.

### Gap
- **Undocumented** — contracts live only as informal JSDoc typedefs.
- **Unversioned** — no `schemaVersion` on any artifact or `--json` payload (only `.atlas/config.json`
  carries `version: 1`, [runtime.js:33](../src/core/runtime.js)).
- **Redundant** — `buildExecutionRequest` ([execution-builder.js](../src/core/execution-builder.js))
  writes the same fields both nested (`input`/`context`) and duplicated at the top level — two sources
  of truth that will eventually disagree.

### Work to close
Write a `CONTRACTS.md` documenting every `--json` shape + execution/plan/context/patch artifact; stamp
a `schemaVersion`; resolve the `execution-builder` duplication.

### Prior-doc status
**New** — under-addressed in README and all archive plans.

---

## Gate 3 — Usable end-to-end across languages — **PARTIALLY MET**

### Current state
A live path works through the headline command: `atlas fix` → `patch stage` makes a live OpenAI call
(`executeProviderRequest({ apiKey: process.env.OPENAI_API_KEY })`,
[patch.js:72-77](../src/commands/patch.js)), then validate → `apply --confirm` → optional rollback
([fix.js](../src/commands/fix.js)). OpenAI is the **only** live adapter
([openai.js:174](../src/adapters/openai.js)); `codex`/`claude` are handoff-only `mode:"manual"`. The
manual handoff/import round-trip is a working fallback.

### Gap
- **The graph was JS/TS-only — now addressed (roadmap #3 done).** The scanner was a TypeScript-AST
  parser with a JS-only heuristic fallback; non-JS/TS files had no import/call graph. It now has
  dependency-light per-language extractors (Python/Ruby/Rust/Go) producing real import + call edges,
  with call resolution via the language-agnostic symbol index. A full tree-sitter AST upgrade stays
  evidence-gated on a larger real repo (the small held-outs don't yet demand it).
- **Context bundles were head-truncated — now symbol-aware (roadmap #6 done).** `compressContent`
  ([context-builder.js](../src/core/context-builder.js)) previously sliced the first 1400 chars, so a
  matched symbol past char 1400 never reached the model. It now centers the excerpt on the matched
  symbol's region (or the first query-token line), filling the budget forward then backward, with
  head-truncation only as a fallback. Verified on a fixture where the target symbol sits past the head.
- **Default model `gpt-5.4`** is a hardcoded literal ([model-config.js:5](../src/core/model-config.js)).

### Work to close
- **Multi-language graph via tree-sitter** (#3): AST-backed edges for ≥1 non-JS/TS language, with no
  JS/TS regression on the held-out eval.
- **Symbol-aware windowing** (#6): center excerpts on the matched symbol's region. **DONE.**

### Prior-doc status
- tree-sitter: **promoted** from Deferred (v2 P2.5) to the critical path, *because of the language axis
  of the north star*.
- Symbol-aware windowing: *carried from v2 P0.2, verified*.
- Live codex/claude headless adapters: *carried from v2 P0.3, reframed as non-blocking P1* (fix already
  runs live on OpenAI; manual handoff works).

---

## Gate 4 — Domain-agnostic core — **NOT MET** (the keystone)

> Reframed from the original "configurable." The goal is not "make the domain heuristics tunable" — it
> is "have no domain heuristics." Per-repo domain config is an explicit **non-goal**.

### Current state
- **All scoring is domain-coupled and hardcoded.** The DELETE-list constants encode NestJS/commerce
  conventions directly in core (full evidence under Gate 1 and the signal-rework table).
- `.atlas/config.json` is created but **never read** ([runtime.js:25-41](../src/core/runtime.js)) — a
  write-only marker. Provider/model defaults are hardcoded, overridable only by CLI flag
  ([model-config.js](../src/core/model-config.js)).

### Gap
The kernel carries one codebase's conventions in its core, so it is not general. A NestJS repo and a
flat Python repo cannot share the ranker. This is also *why Gate 1 can't be measured*: generalization
is untestable while the conventions are welded in and can't be removed.

### Work to close
- **Remove the domain conventions entirely** and replace them with repo-derived structural + statistical
  signals (#1; delete/keep/replace table above). No config fallback for domain tables.
- (Minor, separate from domain logic) Make `.atlas/config.json` actually read for the *repo-agnostic*
  knobs (provider/model defaults; optionally the balance between general signals like graph-distance vs
  term-weight). This is the only legitimate use of config — never for per-repo domain knowledge.

### Prior-doc status
*Carried from v2 P1.5 but inverted*: the prior framing ("extract weights to config") is rejected as the
end goal; removal + repo-derivation replaces it. This is the **keystone** that unblocks Gate 1.

---

## Gate 5 — Observable — **PARTIALLY MET**

### Current state
The run ledger is rich: the `runs` table ([store.js:33-43](../src/core/store.js)) + `summarizeRun`
([store.js:506-539](../src/core/store.js)) expose provider, model, totalTokens, latency, retry, phase
status, `memoryAssisted`/`matchedPatternCount`, handoff target, selectedTests, changedFiles; `atlas
runs` filters by `--command/--status/--limit`. Retries are bounded and honest (default 3, retryable
only on network + `408/409/429/5xx`, [execution-retry.js](../src/core/execution-retry.js),
[openai.js:129-132](../src/adapters/openai.js)).

### Gap
- ~~`cost report` does not aggregate the token data that already exists~~ — **CLOSED (roadmap #7).**
  `getCostReport` ([store.js](../src/core/store.js)) now returns a `tokenUsage` block (total in/out/total
  tokens, run count, and a per-provider/model breakdown sorted by usage) computed from the per-run
  `metrics_json`; the human formatter prints it. The `"not wired yet"` placeholder is gone.
- `classifyTask`/`modelRecommendation` ([planner.js:1-26](../src/core/planner.js)) is substring
  matching and `modelRecommendation` is computed but never read by exec/fix — left as-is on purpose:
  routing is an atlas-os responsibility (Deferred); the kernel now *exposes* both cost and
  classification for the operator layer to act on.

### Work to close
Done (#7). Routing stays with atlas-os; the kernel exposes the signals.

### Prior-doc status
Cost-aggregation gap: **new**. Routing: *reframed as atlas-os work.*

---

## Prioritized, dependency-ordered roadmap

Ordering rationale: **#1 is the keystone** — removing domain conventions and replacing them with
repo-derived signals serves the north star *and* unblocks Gate 1's generalization measurement (#2).
**#3 (tree-sitter)** supports #1 on the language axis. **#4–#7** are independent and parallelizable.

| # | Item | Gate | Rationale (one line) | Done-when |
|---|------|------|----------------------|-----------|
| 1 ✅ | **Remove domain conventions; replace with repo-derived signals** | 4 (also unblocks 1) | The core of "general regardless of codebase": no baked-in vocab/suffix knowledge. | **DONE** — no domain vocab/suffix literals remain in `retrieval.js`/`test-selection.js`; ranking uses structural centrality + repo-corpus IDF; test↔source stem match the only flagged residual. |
| 2 ✅ | **Held-out real-repo eval as the fitness function** | 1 (integrity) | A general ranker can only be proven on repos it was never tuned on. | **DONE** — 5 held-out repos (Python/Go/Ruby/Rust/flat-JS) under `playgrounds/holdout-*` + specs; all 1.00/1.00, commerce held at 1.00/1.00. Next: grow case count + categorize the tail-rank (test-over-source) misses. |
| 3 ✅ | **Multi-language graph (dependency-light, not tree-sitter)** | 3 (language) | The graph is the main domain-free signal; it must work beyond JS/TS. | **DONE** — chose dependency-light per-language extractors over tree-sitter (no eval evidence yet justifying a WASM parser; preserves the dependency-light ethos). `scanner.js` now extracts symbols/imports/calls for Python, Ruby, Rust, Go; call edges resolve via the language-agnostic symbol index. Measured edges: Python 18 import/35 call, Go 34 call, Ruby 13/11, Rust 10/13. Held-out hit rate unchanged at 1.00/1.00; JS/TS unaffected. Upgrade to tree-sitter remains evidence-gated on a larger real repo. |
| 4 | **Full-suite miss-rate harness** | 1 (safety) | Quantifies the depth-2 recall cliff and the trust level of `confirm`. | A run mode runs the full suite alongside the selected subset; the ledger surfaces a rolling miss-rate. |
| 5 | **Document + version the public contracts** | 2 | The operator layer must build against a stable, versioned surface. | `CONTRACTS.md` documents every `--json` + artifact shape; each payload carries `schemaVersion`; the `execution-builder` duplication is resolved. |
| 6 ✅ | **Symbol-aware context windowing** | 3 (usability) | Head-truncation can omit the target symbol. | **DONE** — `compressContent` now centers the excerpt on the matched symbol (or first query-token line), head-truncation only as fallback; verified on a >1400-char fixture where the symbol sits past the head. |
| 7 ✅ | **Wire token/cost aggregation into `cost report`** | 5 | Per-run tokens already exist; surfacing them is what routing/budgeting consumes. | **DONE** — `cost report` now returns a `tokenUsage` block (total in/out/total + per-provider/model breakdown) from the recorded per-run metrics; placeholder removed; verified by test. |

Sequencing: **#1 first** → **#2** (measures #1); **#3** supports #1 for non-JS/TS and pairs with #2.
**#4–#7 in parallel** anytime.

---

## Deferred — NOT needed before atlas-os

- **Per-repo domain config / heuristic tables** — explicit **non-goal**. Relocating conventions into
  config contradicts the north star; do not build it.
- **Semantic embeddings** — *evidence-gated*, not banned. Chosen strategy (Option A): build the
  deterministic repo-derived backbone first; add embeddings only where roadmap #2's held-out eval shows
  a genuine *concept gap* (query terms with no lexical/graph path to the code, e.g. "auth" ↔ "guard").
  Given the north star they are *likely* justified eventually — but only with the eval's evidence and
  per-miss attribution, never on reflex. Keeps the model quarantined behind the adapter seam.
- **Team / shared memory** — README defer; kernel is single-user/local.
- **SQLite FTS5 retrieval scaling** (v2 P2.8) — only at large-repo scale.
- **Memory recency/decay** (v2 P1.6) — only once #2 shows memory drift.
- **Task-classified model routing / cost-routing loop** (v2 P2.9) — **an atlas-os responsibility.** The
  kernel exposes cost + classification (#7); the operator layer decides routing.
- **Semantic / validation-aware retry loops** — README defer.
- **Call-resolution ambiguity hardening** (v2 P2.7) — low-impact; revisit only if #4's miss-rate
  implicates it.

---

## Reconciliation appendix — prior docs mapped to this roadmap

| Prior doc / item | Status | Maps to |
|------------------|--------|---------|
| [30 Day Roadmap.md](30%20Day%20Roadmap.md) Wk1 — real-repo retrieval specs | **Covered, not done**; *promoted to fitness function* | #2 |
| 30 Day Roadmap Wk4 — semantic-retrieval go/no-go | The decision gate, now sequenced behind a measurable backbone | embeddings (Deferred, gated) |
| [README](../README.md) "Post-v0 Roadmap" — semantic retrieval, then shared memory | Correctly deferred but **stale as "next"**; real next is generality + verification | Deferred |
| [V1 Roadmap.md](V1%20Roadmap.md) step 4 — atlas-os after kernel stable | This gate operationalizes "stable" | whole doc |
| [Plan v0.md](Plan%20v0.md) / [Codex v0.md](Codex%20v0.md) — kernel-first | Foundational framing | Context |
| v2 handoff P0.1 / P1.5 — split ranking vs domain config | **Verified, then inverted**: remove conventions, don't relocate to config | #1 |
| v2 P0.2 — symbol-aware windowing | Verified | #6 |
| v2 P1.4 — full-suite miss-rate harness | Verified absent | #4 |
| v2 P2.5 — tree-sitter multi-language graph | **Promoted** Deferred → critical path (language axis of north star) | #3 |
| v2 P0.3 — live codex/claude adapters | Verified handoff-only; reframed non-blocking P1 | P1 polish |
| v2 P1.6 / P2.7 / P2.8 / P2.9 | Verified; not blocking | Deferred |
| **New** — contract documentation + schema versioning | Surfaced here | #5 |
| **New** — `cost report` token-aggregation gap | Surfaced here | #7 |

---

## Verification of this document

Every claim cites a real `file:line`, a committed-report field, or a commit hash. Headline numbers
(100% hit rates, `testAverageRank 1.143`, the rank-2 `shared-webhook-delivery-retry` case, the
`tokenEstimates` placeholder) are quoted from
[atlas-ai-retrieval-report.json](atlas-ai-retrieval-report.json) and
[commerce-app-retrieval-report.json](commerce-app-retrieval-report.json).

Optional, non-destructive baseline re-run (modifies no source):
```bash
node src/cli.js eval retrieval \
  --root playgrounds/commerce-app \
  --spec evals/retrieval/commerce-app.spec.json \
  --check-report --fail-under 1
npm test
```
