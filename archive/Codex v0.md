# Atlas Initial Build Plan: Local CLI Kernel for Repo Intelligence

## Summary
Build **Atlas v0** as a **local TypeScript CLI** optimized for **Codex-first, read/plan-first workflows**. The first thing to build is **the repo intelligence kernel**, not patch generation, UI, or full ECC-style automation.

This first build should prove one core claim: **Atlas can answer repo questions and produce high-quality minimal execution plans without calling Codex for raw discovery**.

Atlas should borrow from ECC at the **pattern level only**:
- Session/memory lifecycle concepts
- Sequential orchestration phases
- Iterative retrieval for subagents
- Worktree-based parallelization conventions
- Continuous learning as post-run extraction

Do **not** bootstrap from ECC’s full package surface, hooks, or skill catalog in v0.

## Key Changes
### 1. Establish the Atlas local runtime
Create a new CLI project with these initial commands:
- `atlas init`
- `atlas index`
- `atlas ask "<question>"`
- `atlas plan "<task>"`
- `atlas cost report`

Default storage under `.atlas/`:
- `config.json`
- `repo_index.db` or `repo_index.sqlite`
- `summaries/`
- `memory/`
- `runs/`
- `costs/`
- `cache/`

Use **SQLite as the default local system of record** for metadata, runs, memory, and cost logs. If embeddings are included in v0, keep them local and simple; do not introduce pgvector/Redis yet.

### 2. Build the repo intelligence kernel first
Implement the first production subsystem as:

**Scan -> Index -> Retrieve -> Summarize -> Plan**

Core capabilities:
- File discovery and language detection
- Symbol extraction for supported languages
- Import/dependency edge extraction
- File and function summaries
- Keyword + structural retrieval
- Minimal context assembly for a question/task
- Cheap-model planning output for code tasks

This kernel should answer:
- “Where is X implemented?”
- “What files are involved in Y?”
- “What is the likely change surface for Z?”
- “What tests would probably be impacted?”

Initial retrieval should be **hybrid but pragmatic**:
- Start with filesystem + ripgrep + symbol index + dependency edges
- Add vector retrieval only if it materially improves results in a measurable way
- Keep context compression deterministic where possible

### 3. Define the first Atlas orchestration contract
Adopt ECC’s useful sequencing pattern, but implement it as Atlas-native phases:
1. `classify`
2. `retrieve`
3. `compress`
4. `plan`
5. `log`

In v0, stop at `plan`. Do not mutate repo files yet.

Initial internal interfaces:
- `TaskRequest`: user request, repo root, mode, budget hints
- `TaskClassification`: task type, risk, likely files, required tools, context budget
- `RepoArtifact`: file, symbol, import edge, ownership/test linkage if known
- `RetrievalBundle`: ranked files, symbols, snippets, summaries, rationale
- `PlanArtifact`: steps, files to inspect, likely solution shape, test targets, risks
- `RunRecord`: timestamps, token estimates, tools used, outputs, acceptance status
- `MemoryRecord`: distilled lesson, scope, trigger conditions, evidence links

### 4. Bring in ECC ideas in the right order
Reuse these ECC ideas immediately:
- **Iterative retrieval**: planner can ask retrieval for one or two follow-up passes before finalizing a plan
- **Context discipline**: compressed summaries over raw file dumps
- **Session logging**: each run produces a durable artifact
- **Learning extraction**: post-run memory records from successful plans/runs
- **Parallelization policy**: document worktree/cascade rules, but do not automate multi-instance orchestration yet

Defer these until after v0:
- Automatic Stop/SessionStart hooks
- Continuous skill generation into reusable prompts/skills
- Patch engine and rollback
- Validation retry loops
- Subagent spawning
- Multi-provider routing
- Web UI/dashboard

## Public Interfaces / Commands
Initial command behavior should be explicit:

- `atlas init`
  Initializes `.atlas/`, config, local DB, and ignore/default rules.

- `atlas index`
  Scans the repo, builds symbol/dependency metadata, and refreshes summaries/cache.

- `atlas ask "<question>"`
  Returns ranked answer with cited files/symbols and a compressed evidence bundle.

- `atlas plan "<task>"`
  Produces a structured implementation plan:
  affected files, likely approach, risks, and likely tests.

- `atlas cost report`
  Shows local metrics:
  scan time, retrieval cost, model calls, token estimates, cache hit rate.

Output format defaults to human-readable CLI text, with `--json` support from the start for every command.

## Test Plan
### Functional scenarios
- Index an empty repo, small repo, and medium multi-folder repo successfully
- Answer “where is X?” using only local retrieval/index data
- Produce a stable plan for a bug-fix style request with cited evidence
- Re-run `atlas index` incrementally without rebuilding unchanged artifacts
- Log every `ask` and `plan` run with cost/timing metadata

### Quality checks
- Retrieval returns relevant files for known seeded queries
- Summaries remain under configured token budgets
- Plans reference only retrieved evidence, not invented code locations
- JSON outputs are schema-stable across commands

### Failure cases
- Missing repo root
- Unsupported language files
- Broken parse for one file should degrade gracefully, not fail the whole index
- Missing model credentials for planning should still allow retrieval-only operation

## Assumptions and Defaults
- Initial target is **single-user, local, single-repo** operation.
- Initial model target is **Codex first**; multi-provider abstraction is deferred.
- The first milestone is **read/plan only**; no automated code edits in v0.
- Primary implementation language is **TypeScript** for the CLI/runtime.
- Use **SQLite** locally before any team/shared memory architecture.
- ECC is used as a **design reference**, not as a base dependency or scaffold.
- If semantic embeddings are added in v0, keep them **local and optional**.
- UI is deferred until the CLI kernel proves retrieval quality and token savings.

