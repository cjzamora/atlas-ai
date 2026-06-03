# Atlas v0

Atlas is a local CLI for repo intelligence, planning, and cost-aware AI coding workflows.

This v0 focuses on the layers that should happen before a coding model is asked to edit code:

- repo scanning and indexing
- symbol and dependency graph construction
- retrieval-backed question answering
- deterministic planning
- impacted-test selection
- compact context bundle generation
- advisory reuse of prior confirmed fix patterns during planning and context assembly

It is intentionally local-first and dependency-light.

## Current Commands

- `atlas init`
- `atlas index`
- `atlas ask "<query>"`
- `atlas plan "<task>"`
- `atlas context "<task>"`
- `atlas prompt "<task>"`
- `atlas exec prepare "<task>"`
- `atlas exec run "<task>"`
- `atlas exec handoff "<task>"`
- `atlas exec import "<task>"`
- `atlas fix "<task>"`
- `atlas patch stage "<task>"`
- `atlas patch show <artifact-id>`
- `atlas patch apply <artifact-id>`
- `atlas patch confirm <artifact-id>`
- `atlas patch rollback <artifact-id>`
- `atlas test impacted "<query>"`
- `atlas test run --artifact <artifact-id>`
- `atlas test missrate "<query>"`
- `atlas runs`
- `atlas memory search "<query>"`
- `atlas cost report`
- `atlas eval retrieval --spec <spec.json>`

All commands support `--root <path>` and most support `--json`.

OpenAI-backed commands default to `provider: openai` and `model: gpt-5.4` unless you override them with `--provider` or `--model`.

## Local Usage

From the project root:

```bash
node src/cli.js index --root playgrounds/holdout-js-eventbus
node src/cli.js ask "subscribe publish event bus pubsub" --root playgrounds/holdout-js-eventbus
node src/cli.js plan "fix events not delivered after unsubscribe" --root playgrounds/holdout-js-eventbus
node src/cli.js context "fix events not delivered after unsubscribe" --root playgrounds/holdout-js-eventbus
node src/cli.js prompt "fix events not delivered after unsubscribe" --root playgrounds/holdout-js-eventbus
node src/cli.js exec prepare "fix events not delivered after unsubscribe" --root playgrounds/holdout-js-eventbus
node src/cli.js exec run "fix events not delivered after unsubscribe" --root playgrounds/holdout-js-eventbus
node src/cli.js exec handoff "fix events not delivered after unsubscribe" --root playgrounds/holdout-js-eventbus --provider codex
node src/cli.js exec import "fix events not delivered after unsubscribe" --root playgrounds/holdout-js-eventbus --provider codex --file /path/to/codex-response.txt
node src/cli.js fix "fix events not delivered after unsubscribe" --root playgrounds/holdout-js-eventbus
node src/cli.js fix "fix events not delivered after unsubscribe" --rollback-on-fail --root playgrounds/holdout-js-eventbus
node src/cli.js patch stage "fix events not delivered after unsubscribe" --root playgrounds/holdout-js-eventbus
node src/cli.js patch show patch-<id> --root playgrounds/holdout-js-eventbus
node src/cli.js test run --artifact patch-<id> --root playgrounds/holdout-js-eventbus
node src/cli.js patch apply patch-<id> --root playgrounds/holdout-js-eventbus
node src/cli.js patch apply patch-<id> --confirm --root playgrounds/holdout-js-eventbus
node src/cli.js patch confirm patch-<id> --root playgrounds/holdout-js-eventbus
node src/cli.js patch rollback patch-<id> --root playgrounds/holdout-js-eventbus
node src/cli.js test impacted "ttl cache get set evict" --root playgrounds/holdout-js-eventbus
node src/cli.js runs --command fix --status completed --root playgrounds/holdout-js-eventbus
node src/cli.js memory search "pricing fallback" --root playgrounds/holdout-js-eventbus
node src/cli.js eval retrieval --root test/fixtures/sample-repo --spec /path/to/retrieval-spec.json
node src/cli.js eval retrieval --root test/fixtures/sample-repo --spec /path/to/retrieval-spec.json --report /tmp/retrieval-report.json --fail-under 0.8
node src/cli.js eval retrieval --root playgrounds/holdout-js-eventbus --spec evals/retrieval/holdout-js-eventbus.spec.json --report archive/holdout-js-eventbus-retrieval-report.json --check-report --fail-under 1
```

## Manual Codex / Claude Round-Trip

For manual execution environments such as Codex and Claude Code:

1. Prepare a handoff bundle:

```bash
node src/cli.js exec handoff "fix events not delivered after unsubscribe" --root playgrounds/holdout-js-eventbus --provider codex
```

2. Paste the generated prompt into Codex or Claude Code and save the response to a local file.

3. Import that response back into Atlas as a staged patch artifact:

```bash
node src/cli.js exec import "fix events not delivered after unsubscribe" --root playgrounds/holdout-js-eventbus --provider codex --file /path/to/response.txt
```

4. Run the selected tests against the imported artifact:

```bash
node src/cli.js test run --artifact patch-<id> --root playgrounds/holdout-js-eventbus
```

5. Apply and confirm the imported patch:

```bash
node src/cli.js patch apply patch-<id> --confirm --root playgrounds/holdout-js-eventbus
```

6. If confirmation fails, roll back explicitly:

```bash
node src/cli.js patch rollback patch-<id> --root playgrounds/holdout-js-eventbus
```

## Included Fixtures

### `test/fixtures/sample-repo`

Small deterministic JS fixture for automated tests.

### `test/fixtures/ts-graph-sample`

Small domain-neutral TypeScript fixture covering AST symbol extraction (class
methods), constructor-injection call resolution across files, and the staged-test
validation runner.

### `playgrounds/holdout-*`

Held-out, deliberately heterogeneous fixtures used to measure that retrieval and
impacted-test selection generalize across languages and structures the scoring was
never tuned against (the scoring carries no domain vocabulary or naming conventions):

- `holdout-python-tasks` — Python package, `tests/test_*.py`
- `holdout-go-inventory` — Go modules, colocated `*_test.go`
- `holdout-ruby-geometry` — Ruby `lib/` + RSpec `spec/*_spec.rb`
- `holdout-rust-parser` — Rust crate, `tests/*_test.rs`
- `holdout-js-eventbus` — flat ESM JavaScript, kebab-case, no framework suffixes
- `holdout-web-dashboard` — frontend assets: HTML linking CSS/JS, CSS `@import`, SCSS `@use`

Each has a committed retrieval spec under `evals/retrieval/holdout-*.spec.json`.
`holdout-js-eventbus` is the committed baseline / drift guard
(`archive/holdout-js-eventbus-retrieval-report.json`).

## Testing

Run the automated test suite:

```bash
npm test
```

Current coverage focuses on:

- scanner output
- graph relationships
- impacted-test selection
- planning output
- context bundle generation
- prompt generation
- execution request packaging
- openai execution wrapper behavior

## Structure

- `src/commands`: CLI command handlers
- `src/core`: runtime, storage, retrieval, planning, indexing, and shared helpers
- `src/validation`: validation-related application logic
- `test`: automated tests and small fixture repo
- `playgrounds`: larger manual test fixtures

## Retrieval Evaluation

Atlas now supports repeatable retrieval benchmarking before adding semantic retrieval.

Example spec:

```json
{
  "limit": 5,
  "cases": [
    {
      "query": "pricing coupon discount",
      "expectedEvidence": ["src/services/pricing.js"],
      "expectedTests": ["test/services/pricing.test.js"]
    }
  ]
}
```

Run it with:

```bash
node src/cli.js eval retrieval --root test/fixtures/sample-repo --spec /path/to/retrieval-spec.json
```

Run the committed held-out baseline with:

```bash
node src/cli.js eval retrieval \
  --root playgrounds/holdout-js-eventbus \
  --spec evals/retrieval/holdout-js-eventbus.spec.json \
  --report archive/holdout-js-eventbus-retrieval-report.json \
  --check-report \
  --fail-under 1
```

Refresh the archive intentionally by running the same command without `--check-report`.

Optional quality gate:

```bash
node src/cli.js eval retrieval \
  --root /path/to/repo \
  --spec /path/to/retrieval-spec.json \
  --report /tmp/retrieval-report.json \
  --fail-under 0.8
```

This reports:

- evidence hit rate
- impacted-test hit rate
- average match rank
- JSON diagnostics for impacted-test ranking and memory assistance
- per-query misses that can justify future semantic retrieval work
- optional pass/fail thresholding for real-repo baselines

Semantic A/B (lexical vs hybrid) — measures whether embeddings earn their keep before you turn
them on by default. Requires embeddings enabled + a local model installed (see "Semantic
retrieval" above); a concept-gap spec ships at `evals/retrieval/holdout-js-eventbus.semantic.spec.json`:

```bash
node src/cli.js eval retrieval \
  --root playgrounds/holdout-js-eventbus \
  --spec evals/retrieval/holdout-js-eventbus.semantic.spec.json \
  --ab
```

The `--ab` block reports lexical vs hybrid evidence hit-rate and average rank, plus the lift.

## Scope of v0

Implemented:

- local runtime storage in `.atlas/`
- SQLite-backed repo metadata and run ledger
- TypeScript-AST scanning for JS/TS/JSX, plus dependency-light per-language symbol/import/call extraction for Python, Ruby, Rust, and Go, and asset-graph extraction for HTML (`<script>`/`<link>`), CSS/SCSS/LESS (`@import`/`@use`, selectors/mixins), and Vue/Svelte (heuristic fallback for other text files)
- import/call/test graph edges
- retrieval-backed planning
- graph-backed impacted-test selection
- Codex-ready context bundles
- model-ready prompt and execution request generation
- provider-normalized execution adapter seam with OpenAI registered as the first adapter
- live OpenAI execution request/response logging
- manual handoff adapters for Codex and Claude Code built on the same normalized execution request
- external execution result ingestion that stages Codex or Claude responses directly into patch artifacts
- run history summaries that expose handoff targets, imported artifacts, and import sources for manual adapter workflows
- review-only patch staging artifacts under `.atlas/artifacts`
- staged patch validation execution with artifact-backed result persistence
- validated unified-diff application for staged artifacts
- post-apply confirmation by rerunning selected tests
- rollback support using pre-apply file snapshots
- optional `patch apply --confirm` convenience path that preserves the same artifact states
- thin `fix` orchestration that composes stage, validate, and apply/confirm
- optional `fix --rollback-on-fail` path for automatic recovery after failed post-apply confirmation
- aggregated `fix` metrics for tokens, selected tests, and phase status
- filtered run history with summarized outcomes
- lightweight memory extraction from confirmed and rolled-back fix runs
- advisory prior-pattern hints in `plan` and `context` from relevant confirmed fix history
- advisory prior-pattern hints in `prompt`, `exec prepare`, and staged patch requests from relevant confirmed fix history
- bounded retrieval and impacted-test ranking boosts from prior confirmed fix history
- run summaries and patch artifacts record when prior memory influenced Atlas behavior
- memory learning dedupes repeated outcomes and prefers higher-confidence confirmed patterns over contradictory failures
- transient provider/runtime retries for `exec run` and `patch stage`, limited to network, rate-limit, timeout, and 5xx-style failures
- retrieval evaluation against query/spec fixtures so semantic retrieval is added only when current ranking evidence says it is needed

Execution adapter contract in v0:

- `exec prepare` builds a provider-agnostic request artifact with:
  - `input.promptText` for the model-ready prompt
  - `context` for bounded execution context such as files, selected tests, and advisory memory hints
- adapters return a normalized response shape with:
  - `response.id`
  - `response.provider`
  - `response.status`
  - `response.finishReason`
  - `response.text`
- `exec handoff` builds provider-specific manual export artifacts for `codex` and `claude` without making live API calls
- `exec import` reads an external response file and stages it directly into the standard patch workflow
- provider-specific wire details stay inside the adapter implementation
- JavaScript and TypeScript repository scanning now uses a real TypeScript AST-backed parser, with the older heuristic scanner retained as fallback behavior for other file families

Semantic retrieval (optional, off by default):

- Retrieval can run in **hybrid** mode — the domain-agnostic lexical engine fused (reciprocal
  rank fusion) with semantic vector search — so queries match by meaning regardless of language,
  structure, or naming. The embedder is a **pluggable adapter** with a local default model; it is
  an **optional dependency**, so the default install stays dependency-light and offline, and
  retrieval transparently degrades to lexical-only when no embedder is available.
- Enable it per repo: `npm install @huggingface/transformers`, set
  `"embeddings": { "enabled": true, "provider": "local" }` in `.atlas/config.json`, then re-run
  `atlas index` to build the vector index. Measure whether it helps with the A/B below before
  relying on it.

Not implemented yet:

- team/shared memory
- per-symbol embeddings, an ANN index, and a hosted embedding API (all deferred behind the
  embedding/seam abstractions, gated on eval evidence)

These are intentionally deferred beyond v0:

- `semantic or validation-aware retry loops`
  Atlas now retries only transient provider/runtime failures. Semantic retries for malformed output, validation failures, or re-planning remain deferred until stricter autonomy boundaries are defined.
- `team/shared memory`
  Best added later in v1 or v2, once Atlas is ready to move beyond a local single-user workflow.

## Post-v0 Roadmap

Recommended order after v0:

1. Semantic retrieval if larger-repo quality demands it
2. Shared/team memory and broader orchestration

## Release Status

Atlas v0 is complete for the current local-kernel scope once manual CLI checks and `npm test` pass.
