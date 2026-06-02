# Atlas Roadmap to v1

## Current Position

Atlas v0 already has the core safe execution loop:

- repo indexing and retrieval
- planning, context, and prompt generation
- execution request preparation
- live OpenAI execution
- patch staging
- validation execution
- patch apply, confirm, and rollback
- `fix` orchestration with optional rollback on failed confirmation
- run ledger and cost reporting

The remaining v0 work should focus on quality, observability, and memory rather than adding many more commands.

## Roadmap

### 1. Finish v0 Kernel Quality

Goal: make the existing loop reliable enough for day-to-day use.

Focus areas:

- richer run history and summaries
- lightweight memory extraction from runs
- better retrieval and ranking on medium repos
- stronger validation summaries
- clearer cost and token observability
- better failure reporting across `exec`, `patch`, and `fix`

At the end of this phase, Atlas should feel stable as a local repo-intelligence and safe-change system.

### 2. Add Shared Memory and Learning

Goal: make Atlas improve from prior work instead of acting like a stateless wrapper.

Build:

- decision memory
- pattern memory
- successful-fix memory
- memory retrieval during `plan` and `fix`
- extraction of reusable lessons from confirmed artifacts

This is the first serious bridge from the current runtime kernel to the broader Atlas vision.

### 3. Formalize Adapter Boundaries

Goal: keep Atlas intelligence shared while making execution backends swappable.

Build:

- execution adapter contract
- OpenAI adapter as the first official adapter
- a Codex-oriented handoff or manual adapter path
- later a Claude adapter contract

Atlas should keep planning, retrieval, memory, validation, and orchestration in the shared layer. Providers should stay thin.

### 4. Add the `atlas-os/` Operating Layer

Goal: document the operating system layer after the kernel and adapter seams are stable.

Add:

- root `AGENTS.md`
- principles
- rules
- skills
- evaluation policies
- memory conventions
- adapter documentation

This should come after the implementation is stable enough that the docs can describe real behavior instead of speculative architecture.

### 5. Add Controlled Orchestration

Goal: support larger tasks safely without jumping straight to opaque autonomy.

Build:

- stronger `fix` orchestration policies
- checkpointed multi-step execution
- reviewer and validator stages
- limited delegation patterns later, if needed

The emphasis should remain auditability and recoverability, not “maximum autonomy.”

### 6. Cut v1

Atlas should be considered v1 when it can reliably:

- understand a repo
- plan a fix with minimal context
- execute through an adapter
- stage, validate, apply, confirm, and rollback changes
- remember prior successful fixes and decisions
- operate through documented rules, skills, and policies
- support one primary adapter well and a second adapter shape credibly

## Immediate Next Step

The next recommended implementation task is:

- richer run history and memory extraction

That improves both the current v0 kernel and the future v1 shared-memory operating-system direction.
