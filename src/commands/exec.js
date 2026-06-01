import { ensureAtlasRuntime } from "../core/runtime.js";
import { searchEvidence } from "../core/retrieval.js";
import { classifyTask, buildPlanArtifact } from "../core/planner.js";
import { selectImpactedTests } from "../validation/test-selection.js";
import { buildContextBundle } from "../core/context-builder.js";
import { buildPromptFromBundle } from "../core/prompt-builder.js";
import { buildExecutionRequest } from "../core/execution-builder.js";

export async function execCommand({ args, flags }) {
  const subcommand = args[0];
  if (subcommand !== "prepare") {
    throw new Error('Usage: atlas exec prepare "<task>"');
  }

  const task = args.slice(1).join(" ").trim();
  if (!task) {
    throw new Error('Usage: atlas exec prepare "<task>"');
  }

  const runtime = await ensureAtlasRuntime(flags.root);
  const limit = Number(flags.limit || 6);
  const classification = classifyTask(task);
  const evidence = searchEvidence(runtime.paths.dbFile, task, limit);
  const impacted = classification.requiresTests
    ? selectImpactedTests(runtime.paths.dbFile, task, limit)
    : { impactedFiles: [], tests: [] };
  const plan = buildPlanArtifact(task, classification, evidence.matches, impacted);
  const bundle = await buildContextBundle({
    rootDir: runtime.rootDir,
    task,
    classification,
    evidenceMatches: evidence.matches,
    plan
  });
  const prompt = buildPromptFromBundle(bundle);
  const request = buildExecutionRequest({
    task,
    classification,
    bundle,
    prompt,
    provider: String(flags.provider || "openai"),
    model: String(flags.model || "codex")
  });

  return {
    ok: true,
    command: "exec prepare",
    task,
    request
  };
}
