# Atlas Kernel Public Contracts

`schemaVersion: 1`

This documents the interfaces an operator layer (atlas-os) builds against: the CLI
command surface, the shared `--json` envelope, the normalized execution
request/response, and the persisted artifacts (plan, context bundle, patch). Shapes
are derived from the source; the file/function of record is named for each.

## Versioning

- `CONTRACT_VERSION` (`src/core/contracts.js`) is the single source of truth; currently `1`.
- It is stamped as `schemaVersion` on the two **persisted, operator-facing** contracts:
  the **execution request** (`buildExecutionRequest`, `src/core/execution-builder.js`) and the
  **patch artifact** (`buildPatchArtifact`, `src/core/patch-artifact.js`).
- Bump `CONTRACT_VERSION` when a field is **removed** or its **meaning changes**. Purely
  additive fields do **not** require a bump, so consumers should ignore unknown fields.
- The `eval retrieval` report is intentionally **not** versioned in-band: it is a byte-exact
  committed drift guard (`--check-report`), so its shape is fixed by that mechanism instead.

## CLI output envelope

Every command returns an object with a shared envelope, rendered by `src/core/output.js`
(`--json` ⇒ `JSON.stringify(value, null, 2)`; otherwise a human view):

```
{ "ok": boolean, "command": string, ... }
```

Errors are uniform: `{ "ok": false, "error": string }` (`src/cli.js`). Global flags:
`--root <path>` (repo root) and `--json`. Most commands also accept `--limit`.

## Command surface

| Command | Args | Notable flags | Key `--json` keys (beyond `ok`/`command`) |
|---|---|---|---|
| `init` | — | `--root` | `paths` |
| `index` | — | `--root` | indexed file/edge counts |
| `ask "<q>"` | query | `--limit` | `query`, `answer`, `evidence[]` |
| `plan "<task>"` | task | `--limit` | `task`, `classification`, `plan`, `context` |
| `context "<task>"` | task | `--limit` | `task`, `bundle` |
| `prompt "<task>"` | task | `--limit` | `task`, `bundle`, `prompt` |
| `exec prepare "<task>"` | task | `--provider/--model` | `request` |
| `exec run "<task>"` | task | `--provider/--model` | `request`, `response`, `usage`, `retry`, `status` |
| `exec handoff "<task>"` | task | `--provider` | `request`, `handoff` |
| `exec import "<task>"` | task | `--provider`, `--file` | `artifactId`, `artifact` |
| `fix "<task>"` | task | `--rollback-on-fail` | `status`, `stage`, `validation`, `apply`, `metrics`, `phaseSummary` |
| `patch stage "<task>"` | task | `--provider/--model` | `artifactId`, `artifact`, `usage`, `retry` |
| `patch show <id>` | artifact id | — | `artifact` |
| `patch apply <id>` | artifact id | `--confirm` | `status`, `changedFiles[]`, `artifact` |
| `patch confirm <id>` | artifact id | — | `status`, `postApplyValidation`, `artifact` |
| `patch rollback <id>` | artifact id | — | `status`, `changedFiles[]`, `artifact` |
| `test impacted "<q>"` | query | `--limit` | `impactedFiles[]`, `tests[]` |
| `test run` | — | `--artifact <id>` | `status`, `summary`, `results[]`, `artifact` |
| `runs` | — | `--command`, `--status`, `--limit` | `filters`, `count`, `runs[]` |
| `memory search "<q>"` | query | `--limit` | `matches[]` |
| `cost report` | — | — | `report` (see Observability) |
| `eval retrieval` | — | `--spec`, `--report`, `--check-report`, `--fail-under` | `threshold`, `summary`, `cases[]` |

## Normalized execution request

Built by `buildExecutionRequest` (`src/core/execution-builder.js`). The canonical nested
fields are `input` and `context`; the flat top-level mirrors (`prompt`, `selectedTests`,
`files`, `contextBudget`, `memoryHints`, `memoryAssistance`) are an **intentional**
convenience for thin adapters and carry the same values — treat `input`/`context` as
canonical.

```
{
  "schemaVersion": 1,
  "requestId": string,            // sha1(task:prompt) truncated to 12
  "provider": string,
  "model": string,
  "task": string,
  "taskType": string,             // from classifyTask
  "risk": "low" | "medium" | "high",
  "input": { "promptText": string },
  "context": {
    "contextBudget": string,
    "selectedTests": string[],
    "memoryHints": Array<{ summary, outcome, files[], tests[] }>,
    "memoryAssistance": { matchedPatternCount, retrievalBoostApplied, testBoostApplied, boostedPaths[], boostedTests[] },
    "files": Array<{ path: string, role: string, symbol: string | null }>
  },
  // flat mirror of the above (convenience):
  "contextBudget": string, "selectedTests": string[], "memoryHints": [...],
  "memoryAssistance": {...}, "files": [...], "prompt": string
}
```

## Normalized execution response / handoff

Adapters return the response shape (`src/core/contracts.js`, `src/adapters/openai.js`):

```
{ "id": string|null, "provider": string, "status": string|null, "finishReason": string|null, "text": string }
```

Manual handoff (`exec handoff`, `src/adapters/codex.js` / `claude.js`):

```
{ "provider", "mode": "manual", "target", "targetModel", "title", "instructions": string[], "promptText", "selectedTests": string[], "files": [...] }
```

## Plan artifact

`buildPlanArtifact` (`src/core/planner.js`):

```
{
  "summary": string,
  "likelyFiles": string[],
  "relatedDependencies": string[],
  "likelyTests": string[],
  "selectedTests": string[],          // graph-backed impacted tests
  "priorPatterns": Array<{ summary, outcome, files[], tests[] }>,
  "memoryAssistance": {...},
  "validationStrategy": { "mode": "none"|"graph"|"heuristic", "rationale": string, "directTests": string[], "expandedTests": string[], "fallbackTests"?: string[] },
  "callHints": string[],
  "steps": string[], "risks": string[], "openQuestions": string[],
  "codexNeeded": boolean
}
```

`classification` (from `classifyTask`): `{ taskType, risk, requiresTests, contextBudget, modelRecommendation }`.

## Context bundle

`buildContextBundle` (`src/core/context-builder.js`): plan fields plus per-file excerpts.
Each `files[]` entry is `{ path, role: "selected_test"|"primary"|"dependency"|"supporting",
summary?, symbol?, excerpt }`. The `excerpt` is **symbol-aware**: when a file exceeds the
per-file budget it is centered on the matched symbol's region (head-truncation only as a
fallback).

## Patch artifact

`buildPatchArtifact` (`src/core/patch-artifact.js`), persisted under `.atlas/artifacts/<id>.json`:

```
{
  "id": "patch-<sha1>", "type": "patch", "schemaVersion": 1, "reviewOnly": true,
  "task", "provider", "model", "requestId": string|null, "responseId": string|null,
  "status": "staged" | "applied" | "confirmed" | "apply_failed_validation" | "apply_validation_skipped" | "rolled_back",
  "createdAt": ISO8601,
  "parseStatus": "parsed" | "partial" | "unstructured",
  "patches": Array<{ kind: "diff"|"code", language: string|null, diff: string }>,
  "rawOutput": string,
  "usage": { inputTokens, outputTokens, totalTokens } | null,
  "importSource": { type: "file", path } | null,
  "selectedTests": string[],
  "memoryHints": [...], "memoryAssistance": {...},
  "files": [...],
  "validation": { status, summary, failureReason?, results[] } | null,
  "postApplyValidation": { ... } | null,
  "appliedAt": ISO8601|null, "appliedFiles": string[],
  "confirmedAt": ISO8601|null,
  "fileSnapshots": Array<{ path, originalContent }>,
  "rolledBackAt": ISO8601|null, "rolledBackFiles": string[]
}
```

**Lifecycle:** `staged → applied → confirmed`, with `apply_failed_validation` /
`apply_validation_skipped` on a failed/skipped post-apply check and `rolled_back` after a
rollback (snapshots in `fileSnapshots`).

## Observability

`runs` (`summarizeRun`, `src/core/store.js`) — per run: `id, command, input, task, status,
outcome, failureReason, memoryAssisted, matchedPatternCount, provider, model, executionMode,
artifactId, target, importSourceType/Path, selectedTests, totalTokens, changedFiles,
startedAt, finishedAt`.

`cost report` (`getCostReport`) — run/file/edge counts, fix outcome counts, and a
`tokenUsage` block:

```
"tokenUsage": {
  "runsWithTokenData": number,
  "inputTokens": number, "outputTokens": number, "totalTokens": number,
  "byModel": Array<{ provider, model, runs, inputTokens, outputTokens, totalTokens }>  // desc by totalTokens
}
```

Routing on these signals is an atlas-os responsibility; the kernel only exposes them.
