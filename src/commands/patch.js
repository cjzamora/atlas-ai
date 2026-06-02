import { ensureAtlasRuntime } from "../core/runtime.js";
import { searchEvidence } from "../core/retrieval.js";
import { classifyTask, buildPlanArtifact } from "../core/planner.js";
import { selectImpactedTests } from "../validation/test-selection.js";
import { buildContextBundle } from "../core/context-builder.js";
import { buildPromptFromBundle } from "../core/prompt-builder.js";
import { buildExecutionRequest } from "../core/execution-builder.js";
import { createRunLogger } from "../core/run-log.js";
import { executeOpenAIRequest } from "../adapters/openai.js";
import { buildPatchArtifact, readPatchArtifact, updatePatchArtifact, writePatchArtifact } from "../core/patch-artifact.js";
import { applyPatchArtifactToRepo, rollbackPatchArtifact } from "../core/patch-apply.js";
import { runSelectedTests } from "../validation/test-runner.js";

const USAGE = 'Usage: atlas patch stage "<task>"\n       atlas patch show <artifact-id>\n       atlas patch apply <artifact-id>\n       atlas patch confirm <artifact-id>\n       atlas patch rollback <artifact-id>';

export async function patchCommand({ args, flags }) {
  const subcommand = args[0];
  if (subcommand === "stage") {
    return stagePatch({ args: args.slice(1), flags });
  }
  if (subcommand === "show") {
    return showPatch({ args: args.slice(1), flags });
  }
  if (subcommand === "apply") {
    return applyPatch({ args: args.slice(1), flags });
  }
  if (subcommand === "confirm") {
    return confirmPatch({ args: args.slice(1), flags });
  }
  if (subcommand === "rollback") {
    return rollbackPatch({ args: args.slice(1), flags });
  }
  throw new Error(USAGE);
}

async function stagePatch({ args, flags }) {
  const task = args.join(" ").trim();
  if (!task) {
    throw new Error(USAGE);
  }

  const runtime = await ensureAtlasRuntime(flags.root);
  const limit = Number(flags.limit || 6);
  const provider = String(flags.provider || "openai");
  const model = String(flags.model || "codex");
  const request = await buildPatchRequest({
    runtime,
    task,
    limit,
    provider,
    model
  });

  const logger = createRunLogger(runtime.paths.dbFile);
  const run = logger.startRun({
    command: "patch_stage",
    input: task,
    metadata: {
      provider,
      model,
      requestId: request.requestId,
      selectedTests: request.selectedTests,
      executionMode: "patch_stage",
      reviewOnly: true
    }
  });

  if (provider !== "openai") {
    const failure = {
      ok: false,
      command: "patch stage",
      task,
      request,
      status: "failed",
      artifactId: null,
      artifact: null,
      usage: null,
      error: {
        code: "unsupported_provider",
        message: `Provider "${provider}" is not supported yet.`
      }
    };
    logger.finishRun(run.id, {
      status: "failed",
      output: failure,
      metrics: {
        provider,
        model,
        selectedTests: request.selectedTests.length
      }
    });
    return failure;
  }

  const result = await executeOpenAIRequest({
    request,
    apiKey: process.env.OPENAI_API_KEY,
    commandLabel: "atlas patch stage"
  });

  if (!result.ok) {
    const failure = {
      ok: false,
      command: "patch stage",
      task,
      request,
      status: "failed",
      artifactId: null,
      artifact: null,
      usage: result.usage || null,
      error: result.error
    };
    logger.finishRun(run.id, {
      status: "failed",
      output: failure,
      metrics: {
        provider,
        model,
        requestId: request.requestId,
        latencyMs: result.latencyMs ?? null,
        selectedTests: request.selectedTests.length,
        inputTokens: result.usage?.inputTokens ?? null,
        outputTokens: result.usage?.outputTokens ?? null,
        totalTokens: result.usage?.totalTokens ?? null
      }
    });
    return failure;
  }

  const artifact = buildPatchArtifact({
    task,
    request,
    response: result.response,
    usage: result.usage,
    provider,
    model
  });
  const artifactPath = await writePatchArtifact(runtime.paths.artifactsDir, artifact);

  const output = {
    ok: true,
    command: "patch stage",
    task,
    request,
    status: "staged",
    artifactId: artifact.id,
    artifactPath,
    artifact,
    usage: result.usage || null,
    error: null
  };

  logger.finishRun(run.id, {
    status: "completed",
    output,
    metrics: {
      provider,
      model,
      requestId: request.requestId,
      latencyMs: result.latencyMs ?? null,
      selectedTests: request.selectedTests.length,
      stagedPatches: artifact.patches.length,
      inputTokens: result.usage?.inputTokens ?? null,
      outputTokens: result.usage?.outputTokens ?? null,
      totalTokens: result.usage?.totalTokens ?? null
    }
  });

  return output;
}

async function showPatch({ args, flags }) {
  const artifactId = args.join(" ").trim();
  if (!artifactId) {
    throw new Error(USAGE);
  }

  const runtime = await ensureAtlasRuntime(flags.root);
  const artifact = await readPatchArtifact(runtime.paths.artifactsDir, artifactId);
  return {
    ok: true,
    command: "patch show",
    artifactId,
    artifact
  };
}

async function buildPatchRequest({ runtime, task, limit, provider, model }) {
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
  const basePrompt = buildPromptFromBundle(bundle);
  const prompt = [
    basePrompt,
    "",
    "Patch staging instructions:",
    "- Return a unified diff whenever possible.",
    "- If a full unified diff is not possible, return fenced diff or code blocks.",
    "- Do not claim that changes were applied. Atlas will stage this as a review-only patch artifact."
  ].join("\n");

  return buildExecutionRequest({
    task,
    classification,
    bundle,
    prompt,
    provider,
    model
  });
}

async function applyPatch({ args, flags }) {
  const artifactId = args.join(" ").trim();
  if (!artifactId) {
    throw new Error(USAGE);
  }

  const runtime = await ensureAtlasRuntime(flags.root);
  const artifact = await readPatchArtifact(runtime.paths.artifactsDir, artifactId);
  const logger = createRunLogger(runtime.paths.dbFile);
  const run = logger.startRun({
    command: "patch_apply",
    input: artifact.task || artifactId,
    metadata: {
      artifactId,
      selectedTests: artifact.selectedTests || [],
      validationStatus: artifact.validation?.status || null
    }
  });

  const applied = await applyPatchArtifactToRepo({
    rootDir: runtime.rootDir,
    artifact
  });

  const updatedArtifact = await updatePatchArtifact(runtime.paths.artifactsDir, artifactId, (current) => ({
    ...current,
    status: "applied",
    appliedAt: new Date().toISOString(),
    appliedFiles: applied.changedFiles,
    fileSnapshots: applied.fileSnapshots,
    rolledBackAt: null,
    rolledBackFiles: []
  }));

  const output = {
    ok: true,
    command: "patch apply",
    artifactId,
    task: updatedArtifact.task,
    status: "applied",
    changedFiles: applied.changedFiles,
    artifact: updatedArtifact
  };

  logger.finishRun(run.id, {
    status: "completed",
    output,
    metrics: {
      artifactId,
      appliedFiles: applied.changedFiles.length,
      selectedTests: (artifact.selectedTests || []).length
    }
  });

  if (!flags.confirm) {
    return output;
  }

  if (typeof globalThis.__atlasPatchConfirmHook === "function") {
    await globalThis.__atlasPatchConfirmHook();
  }

  const confirmed = await confirmPatch({
    args: [artifactId],
    flags
  });

  return {
    ...output,
    ...confirmed,
    command: "patch apply",
    changedFiles: output.changedFiles
  };
}

async function rollbackPatch({ args, flags }) {
  const artifactId = args.join(" ").trim();
  if (!artifactId) {
    throw new Error(USAGE);
  }

  const runtime = await ensureAtlasRuntime(flags.root);
  const artifact = await readPatchArtifact(runtime.paths.artifactsDir, artifactId);
  const logger = createRunLogger(runtime.paths.dbFile);
  const run = logger.startRun({
    command: "patch_rollback",
    input: artifact.task || artifactId,
    metadata: {
      artifactId,
      selectedTests: artifact.selectedTests || [],
      previousStatus: artifact.status
    }
  });

  const rolledBack = await rollbackPatchArtifact({
    rootDir: runtime.rootDir,
    artifact
  });

  const updatedArtifact = await updatePatchArtifact(runtime.paths.artifactsDir, artifactId, (current) => ({
    ...current,
    status: "rolled_back",
    rolledBackAt: new Date().toISOString(),
    rolledBackFiles: rolledBack.changedFiles
  }));

  const output = {
    ok: true,
    command: "patch rollback",
    artifactId,
    task: updatedArtifact.task,
    status: "rolled_back",
    changedFiles: rolledBack.changedFiles,
    artifact: updatedArtifact
  };

  logger.finishRun(run.id, {
    status: "completed",
    output,
    metrics: {
      artifactId,
      rolledBackFiles: rolledBack.changedFiles.length,
      selectedTests: (artifact.selectedTests || []).length
    }
  });

  return output;
}

async function confirmPatch({ args, flags }) {
  const artifactId = args.join(" ").trim();
  if (!artifactId) {
    throw new Error(USAGE);
  }

  const runtime = await ensureAtlasRuntime(flags.root);
  const artifact = await readPatchArtifact(runtime.paths.artifactsDir, artifactId);
  if (artifact.status !== "applied") {
    throw new Error("Patch artifact must be applied before confirm.");
  }

  const logger = createRunLogger(runtime.paths.dbFile);
  const run = logger.startRun({
    command: "patch_confirm",
    input: artifact.task || artifactId,
    metadata: {
      artifactId,
      selectedTests: artifact.selectedTests || [],
      previousStatus: artifact.status
    }
  });

  const postApplyValidation = await runSelectedTests({
    rootDir: runtime.rootDir,
    selectedTests: artifact.selectedTests || []
  });

  const nextStatus = postApplyValidation.status === "passed"
    ? "confirmed"
    : postApplyValidation.status === "failed"
      ? "apply_failed_validation"
      : "apply_validation_skipped";

  const updatedArtifact = await updatePatchArtifact(runtime.paths.artifactsDir, artifactId, (current) => ({
    ...current,
    status: nextStatus,
    postApplyValidation,
    confirmedAt: nextStatus === "confirmed" ? new Date().toISOString() : null
  }));

  const output = {
    ok: true,
    command: "patch confirm",
    artifactId,
    task: updatedArtifact.task,
    status: nextStatus,
    postApplyValidation,
    artifact: updatedArtifact
  };

  logger.finishRun(run.id, {
    status: postApplyValidation.status === "failed" ? "failed" : "completed",
    output,
    metrics: {
      artifactId,
      selectedTests: (artifact.selectedTests || []).length,
      passedTests: postApplyValidation.summary.passed,
      failedTests: postApplyValidation.summary.failed,
      skippedTests: postApplyValidation.summary.skipped
    }
  });

  return output;
}
