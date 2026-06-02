import { ensureAtlasRuntime } from "../core/runtime.js";
import { createRunLogger } from "../core/run-log.js";
import { searchEvidence } from "../core/retrieval.js";
import { classifyTask, buildPlanArtifact } from "../core/planner.js";
import { selectImpactedTests } from "../validation/test-selection.js";
import { buildContextBundle } from "../core/context-builder.js";
import { findRelevantRunPatterns } from "../core/store.js";

export async function planCommand({ args, flags }) {
  const task = args.join(" ").trim();
  if (!task) {
    throw new Error('Usage: atlas plan "<task>"');
  }

  const runtime = await ensureAtlasRuntime(flags.root);
  const limit = Number(flags.limit || 6);
  const classification = classifyTask(task);
  const evidence = searchEvidence(runtime.paths.dbFile, task, limit);
  const impacted = classification.requiresTests
    ? selectImpactedTests(runtime.paths.dbFile, task, limit)
    : { impactedFiles: [], tests: [] };
  const priorPatterns = findRelevantRunPatterns(runtime.paths.dbFile, task, 3);
  const memoryAssistance = {
    matchedPatternCount: Math.max(
      Number(evidence.memoryAssistance?.matchedPatternCount || 0),
      Number(impacted.memoryAssistance?.matchedPatternCount || 0),
      priorPatterns.length
    ),
    retrievalBoostApplied: Boolean(evidence.memoryAssistance?.retrievalBoostApplied),
    testBoostApplied: Boolean(impacted.memoryAssistance?.testBoostApplied),
    boostedPaths: evidence.memoryAssistance?.boostedPaths || [],
    boostedTests: impacted.memoryAssistance?.boostedTests || []
  };
  const plan = buildPlanArtifact(task, classification, evidence.matches, impacted, priorPatterns, memoryAssistance);
  const context = await buildContextBundle({
    rootDir: runtime.rootDir,
    task,
    classification,
    evidenceMatches: evidence.matches,
    plan
  });

  const logger = createRunLogger(runtime.paths.dbFile);
  const run = logger.startRun({
    command: "plan",
    input: task,
    metadata: { classification, limit }
  });

  logger.finishRun(run.id, {
    status: "completed",
    output: plan,
    metrics: {
      evidenceCount: evidence.matches.length,
      risk: classification.risk,
      selectedTests: impacted.tests.length,
      priorPatterns: priorPatterns.length,
      memoryAssisted: memoryAssistance.retrievalBoostApplied || memoryAssistance.testBoostApplied
    }
  });

  return {
    ok: true,
    command: "plan",
    task,
    classification,
    plan,
    context
  };
}
