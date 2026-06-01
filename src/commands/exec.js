import { ensureAtlasRuntime } from "../core/runtime.js";
import { searchEvidence } from "../core/retrieval.js";
import { classifyTask, buildPlanArtifact } from "../core/planner.js";
import { selectImpactedTests } from "../validation/test-selection.js";
import { buildContextBundle } from "../core/context-builder.js";
import { buildPromptFromBundle } from "../core/prompt-builder.js";
import { buildExecutionRequest } from "../core/execution-builder.js";
import { createRunLogger } from "../core/run-log.js";
import { executeOpenAIRequest } from "../adapters/openai.js";

export async function execCommand({ args, flags }) {
  const subcommand = args[0];
  if (subcommand !== "prepare" && subcommand !== "run") {
    throw new Error('Usage: atlas exec prepare "<task>"\n       atlas exec run "<task>"');
  }

  const task = args.slice(1).join(" ").trim();
  if (!task) {
    throw new Error('Usage: atlas exec prepare "<task>"\n       atlas exec run "<task>"');
  }

  const runtime = await ensureAtlasRuntime(flags.root);
  const limit = Number(flags.limit || 6);
  const provider = String(flags.provider || "openai");
  const model = String(flags.model || "codex");
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
    provider,
    model
  });

  if (subcommand === "prepare") {
    return {
      ok: true,
      command: "exec prepare",
      task,
      request
    };
  }

  const logger = createRunLogger(runtime.paths.dbFile);
  const run = logger.startRun({
    command: "exec_run",
    input: task,
    metadata: {
      provider,
      model,
      requestId: request.requestId,
      selectedTests: request.selectedTests,
      executionMode: "run"
    }
  });

  if (provider !== "openai") {
    const failure = {
      ok: false,
      command: "exec run",
      task,
      request,
      status: "failed",
      response: null,
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
    apiKey: process.env.OPENAI_API_KEY
  });

  const output = {
    ok: result.ok,
    command: "exec run",
    task,
    request,
    response: result.response || null,
    usage: result.usage || null,
    status: result.status,
    error: result.error
  };

  logger.finishRun(run.id, {
    status: result.ok ? "completed" : "failed",
    output,
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

  return {
    ...output
  };
}
