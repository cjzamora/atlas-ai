import { ensureAtlasRuntime } from "../core/runtime.js";
import { retrieveEvidence } from "../core/evidence.js";
import { classifyTask, buildPlanArtifact } from "../core/planner.js";
import { selectImpactedTests } from "../validation/test-selection.js";
import { buildContextBundle } from "../core/context-builder.js";
import { findRelevantRunPatterns } from "../core/store.js";

export async function contextCommand({ args, flags }) {
  const task = args.join(" ").trim();
  if (!task) {
    throw new Error('Usage: atlas context "<task>"');
  }

  const runtime = await ensureAtlasRuntime(flags.root);
  const limit = Number(flags.limit || 6);
  const classification = classifyTask(task);
  const evidence = await retrieveEvidence({ runtime, query: task, limit });
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
  const bundle = await buildContextBundle({
    rootDir: runtime.rootDir,
    task,
    classification,
    evidenceMatches: evidence.matches,
    plan
  });

  return {
    ok: true,
    command: "context",
    task,
    bundle
  };
}
