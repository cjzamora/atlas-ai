# Atlas 30 Day Roadmap

## Goal

Use the next 30 days to move Atlas from a strong local kernel into a reliable, real-repo developer runtime that is ready for a truthful `atlas-os` layer and stronger Codex/Claude workflows.

This roadmap assumes the current state:

- Atlas v0 is complete
- the v1 parser-backed JS/TS indexer is in place
- transient provider/runtime retries are implemented
- retrieval evaluation now supports saved reports and threshold gating

## Success Criteria At Day 30

By the end of this roadmap, Atlas should:

- perform well on at least 2-3 real repos with retrieval specs
- have clearly measured retrieval weaknesses
- improve impacted-test ranking and structural-query retrieval on those repos
- have a more trustworthy memory and run-observability loop
- have a clear go/no-go decision on semantic retrieval
- be ready for a first honest `atlas-os` documentation pass

## Week 1: Real Repo Evaluation Baselines

### Objective

Stop guessing. Measure Atlas on real project queries.

### Deliverables

- retrieval specs for:
  - Atlas repo
  - one medium real project
  - one larger or messier real project
- saved retrieval reports for each repo
- threshold targets agreed per repo

### Tasks

1. Build 10-20 retrieval cases for one real project.
2. Build 10-20 retrieval cases for a second real project.
3. Run `atlas eval retrieval` on each repo.
4. Save reports under `archive/` or repo-local eval folders.
5. Categorize misses:
   - graph/ranking miss
   - naming/synonym miss
   - test-link miss
   - architecture/context miss

### Exit Criteria

- Atlas has at least 3 retrieval reports:
  - Atlas repo
  - real repo A
  - real repo B
- misses are categorized, not just observed

## Week 2: Retrieval And Test-Ranking Improvements

### Objective

Raise retrieval quality using cheaper structural improvements before considering embeddings.

### Focus

- structural query handling
- test ranking for tooling/runtime queries
- better weighting for source vs test files
- better symbol and call ownership heuristics

### Tasks

1. Improve impacted-test ranking for structural and runtime queries.
2. Improve evidence ranking for multi-file lifecycle queries like patch/apply/confirm.
3. Add regression tests for each retrieval miss category from Week 1.
4. Re-run saved retrieval specs after each ranking improvement.

### Exit Criteria

- Atlas repo retrieval baseline improves beyond current test-ranking miss
- at least one real repo shows measurable gain in:
  - evidence hit rate
  - test hit rate
  - average rank

## Week 3: Memory, Observability, And Trustworthiness

### Objective

Make Atlas easier to trust on longer-running real work.

### Focus

- better memory quality signals
- clearer run-level reporting
- better visibility into why ranking changed

### Tasks

1. Improve run summaries for retrieval-eval-assisted work.
2. Add clearer reporting of why memory changed ranking or prompting.
3. Tighten memory confidence rules where contradictory outcomes appear.
4. Add a compact report for:
   - retrieval quality
   - memory assistance
   - fix outcomes

### Exit Criteria

- Atlas can explain not just what it chose, but why
- retrieval and memory effects are visible in reports and runs

## Week 4: Decision Point And v1 Preparation

### Objective

Decide whether semantic retrieval is justified and prepare the next architecture layer.

### Decision Gate

At the end of Week 4, answer:

1. Are remaining retrieval misses mostly caused by:
   - synonym/semantic mismatch
   - concept-level search gaps
   - long-range architecture mismatch

If yes, semantic retrieval is justified.

2. Or are remaining misses mostly caused by:
   - poor graph edges
   - weak ranking heuristics
   - test-link gaps
   - spec/query quality

If yes, keep improving structural retrieval first.

### Tasks

1. Review all saved retrieval reports.
2. Decide:
   - add semantic retrieval next
   - or continue graph/ranking improvements
3. Draft the first `atlas-os` layer plan based on the actual stable kernel.
4. Define the Codex/Claude “seamless usage” checklist for the next phase.

### Exit Criteria

- a written decision exists on semantic retrieval
- the next implementation phase is locked
- Atlas is ready for a truthful `atlas-os` pass

## Recommended Execution Order

1. Real repo retrieval specs
2. Retrieval/test-ranking fixes
3. Memory and run observability tightening
4. Semantic-retrieval decision
5. `atlas-os` planning pass

## What Not To Do In These 30 Days

- do not jump into team/shared memory
- do not build background daemons
- do not build full autonomous semantic retry loops
- do not write the full `atlas-os` layer before the kernel shape is stable
- do not add embeddings without retrieval report evidence

## Best-Case Outcome

If this roadmap goes well, Atlas ends the month as:

- a strong local engineering runtime
- credible on real repos
- measurable instead of speculative
- ready for either:
  - semantic retrieval, if justified
  - or the first `atlas-os` / multi-adapter polish phase
