# Atlas v0

Atlas is a local CLI for repo intelligence, planning, and cost-aware AI coding workflows.

This v0 focuses on the layers that should happen before a coding model is asked to edit code:

- repo scanning and indexing
- symbol and dependency graph construction
- retrieval-backed question answering
- deterministic planning
- impacted-test selection
- compact context bundle generation

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
- `atlas patch stage "<task>"`
- `atlas patch show <artifact-id>`
- `atlas test impacted "<query>"`
- `atlas runs`
- `atlas memory search "<query>"`
- `atlas cost report`

All commands support `--root <path>` and most support `--json`.

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
node src/cli.js patch stage "fix expired coupons still applying at checkout" --root playgrounds/react-nest-demo
node src/cli.js patch show patch-<id> --root playgrounds/react-nest-demo
node src/cli.js test impacted "pricing coupon checkout" --root playgrounds/react-nest-demo
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

Not implemented yet:

- patch application
- retry/validation loops
- semantic embeddings
- true AST or tree-sitter parsing
- team/shared memory

## Commit Guidance

This repo is ready for an initial v0 commit once you are satisfied with the manual CLI checks and `npm test`.
