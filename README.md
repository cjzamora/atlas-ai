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
- `atlas runs`
- `atlas memory search "<query>"`
- `atlas cost report`
- `atlas eval retrieval --spec <spec.json>`

All commands support `--root <path>` and most support `--json`.

OpenAI-backed commands default to `provider: openai` and `model: gpt-5.4` unless you override them with `--provider` or `--model`.

## Local Usage

From the project root:

```bash
node src/cli.js index --root playgrounds/react-nest-demo
node src/cli.js ask "coupon discount pricing checkout" --root playgrounds/react-nest-demo
node src/cli.js plan "fix expired coupons still applying at checkout" --root playgrounds/react-nest-demo
node src/cli.js context "fix expired coupons still applying at checkout" --root playgrounds/react-nest-demo
node src/cli.js prompt "fix expired coupons still applying at checkout" --root playgrounds/react-nest-demo
node src/cli.js exec prepare "fix expired coupons still applying at checkout" --root playgrounds/react-nest-demo
node src/cli.js exec run "fix expired coupons still applying at checkout" --root playgrounds/react-nest-demo
node src/cli.js exec handoff "fix expired coupons still applying at checkout" --root playgrounds/react-nest-demo --provider codex
node src/cli.js exec import "fix expired coupons still applying at checkout" --root playgrounds/react-nest-demo --provider codex --file /path/to/codex-response.txt
node src/cli.js fix "fix expired coupons still applying at checkout" --root playgrounds/react-nest-demo
node src/cli.js fix "fix expired coupons still applying at checkout" --rollback-on-fail --root playgrounds/react-nest-demo
node src/cli.js patch stage "fix expired coupons still applying at checkout" --root playgrounds/react-nest-demo
node src/cli.js patch show patch-<id> --root playgrounds/react-nest-demo
node src/cli.js test run --artifact patch-<id> --root playgrounds/react-nest-demo
node src/cli.js patch apply patch-<id> --root playgrounds/react-nest-demo
node src/cli.js patch apply patch-<id> --confirm --root playgrounds/react-nest-demo
node src/cli.js patch confirm patch-<id> --root playgrounds/react-nest-demo
node src/cli.js patch rollback patch-<id> --root playgrounds/react-nest-demo
node src/cli.js test impacted "pricing coupon checkout" --root playgrounds/react-nest-demo
node src/cli.js runs --command fix --status completed --root playgrounds/react-nest-demo
node src/cli.js memory search "pricing fallback" --root playgrounds/react-nest-demo
node src/cli.js eval retrieval --root test/fixtures/sample-repo --spec /path/to/retrieval-spec.json
node src/cli.js eval retrieval --root test/fixtures/sample-repo --spec /path/to/retrieval-spec.json --report /tmp/retrieval-report.json --fail-under 0.8
node src/cli.js eval retrieval --root playgrounds/commerce-app --spec evals/retrieval/commerce-app.spec.json --report archive/commerce-app-retrieval-report.json --check-report --fail-under 1
```

## Manual Codex / Claude Round-Trip

For manual execution environments such as Codex and Claude Code:

1. Prepare a handoff bundle:

```bash
node src/cli.js exec handoff "fix expired coupons still applying at checkout" --root playgrounds/react-nest-demo --provider codex
```

2. Paste the generated prompt into Codex or Claude Code and save the response to a local file.

3. Import that response back into Atlas as a staged patch artifact:

```bash
node src/cli.js exec import "fix expired coupons still applying at checkout" --root playgrounds/react-nest-demo --provider codex --file /path/to/response.txt
```

4. Run the selected tests against the imported artifact:

```bash
node src/cli.js test run --artifact patch-<id> --root playgrounds/react-nest-demo
```

5. Apply and confirm the imported patch:

```bash
node src/cli.js patch apply patch-<id> --confirm --root playgrounds/react-nest-demo
```

6. If confirmation fails, roll back explicitly:

```bash
node src/cli.js patch rollback patch-<id> --root playgrounds/react-nest-demo
```

## Included Fixtures

### `test/fixtures/sample-repo`

Small deterministic fixture for automated tests.

### `playgrounds/react-nest-demo`

Medium-sized React + Nest-style fixture for manual CLI testing.

It includes:

- frontend pages and service clients
- backend auth, checkout, pricing, coupon, and notifications modules
- shared contracts
- test files linked to the graph

### `playgrounds/commerce-app`

Atlas-owned commerce SaaS fixture for committed kernel calibration.

It includes:

- auth and API-key guard modules
- checkout, discount validation, catalog, and orders modules
- shared webhook delivery and retry queue modules
- provider-specific Stripe Connect and Stripe webhook modules
- ledger mapper, service, and Inngest-style sync modules
- direct and neighboring tests for retrieval and impacted-test ranking

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

Run the committed Atlas-owned commerce baseline with:

```bash
node src/cli.js eval retrieval \
  --root playgrounds/commerce-app \
  --spec evals/retrieval/commerce-app.spec.json \
  --report archive/commerce-app-retrieval-report.json \
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

## Scope of v0

Implemented:

- local runtime storage in `.atlas/`
- SQLite-backed repo metadata and run ledger
- JS/TS-oriented structured scanning with fallback extraction
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

Not implemented yet:

- semantic embeddings
- team/shared memory

These are intentionally deferred beyond v0:

- `semantic or validation-aware retry loops`
  Atlas now retries only transient provider/runtime failures. Semantic retries for malformed output, validation failures, or re-planning remain deferred until stricter autonomy boundaries are defined.
- `semantic embeddings`
  Best added only if retrieval quality becomes a real bottleneck on larger repos.
- `team/shared memory`
  Best added later in v1 or v2, once Atlas is ready to move beyond a local single-user workflow.

## Post-v0 Roadmap

Recommended order after v0:

1. Semantic retrieval if larger-repo quality demands it
2. Shared/team memory and broader orchestration

## Release Status

Atlas v0 is complete for the current local-kernel scope once manual CLI checks and `npm test` pass.
