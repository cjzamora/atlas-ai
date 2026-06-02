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
- live OpenAI execution request/response logging
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

Not implemented yet:

- patch application
- retry loops
- semantic embeddings
- true AST or tree-sitter parsing
- team/shared memory

## Commit Guidance

This repo is ready for an initial v0 commit once you are satisfied with the manual CLI checks and `npm test`.
