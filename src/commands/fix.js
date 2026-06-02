import { patchCommand } from "./patch.js";
import { testCommand } from "./test.js";
import { ensureAtlasRuntime } from "../core/runtime.js";
import { createRunLogger } from "../core/run-log.js";
import { resolveModelConfig } from "../core/model-config.js";

export async function fixCommand({ args, flags }) {
  const task = args.join(" ").trim();
  if (!task) {
    throw new Error('Usage: atlas fix "<task>"');
  }

  const runtime = await ensureAtlasRuntime(flags.root);
  const logger = createRunLogger(runtime.paths.dbFile);
  const { provider, model } = resolveModelConfig(flags);
  const run = logger.startRun({
    command: "fix",
    input: task,
    metadata: {
      provider,
      model,
      rollbackOnFail: Boolean(flags.rollbackOnFail)
    }
  });

  const stage = await patchCommand({
    args: ["stage", task],
    flags
  });

  if (!stage.ok || !stage.artifactId) {
    const output = {
      ok: false,
      command: "fix",
      task,
      status: "stage_failed",
      stage,
      validation: null,
      apply: null,
      rollback: null,
      artifact: stage.artifact || null,
      metrics: buildFixMetrics({ stage, validation: null, apply: null, rollback: null }),
      phaseSummary: buildPhaseSummary({ stage, validation: null, apply: null, rollback: null })
    };
    finishFixRun(logger, run.id, output);
    return output;
  }

  const validation = await testCommand({
    args: ["run"],
    flags: { ...flags, artifact: stage.artifactId }
  });

  if (!validation.ok || validation.status !== "passed") {
    const output = {
      ok: false,
      command: "fix",
      task,
      status: "validation_failed",
      artifactId: stage.artifactId,
      stage,
      validation,
      apply: null,
      rollback: null,
      artifact: validation.artifact || null,
      metrics: buildFixMetrics({ stage, validation, apply: null, rollback: null }),
      phaseSummary: buildPhaseSummary({ stage, validation, apply: null, rollback: null })
    };
    finishFixRun(logger, run.id, output);
    return output;
  }

  const apply = await patchCommand({
    args: ["apply", stage.artifactId],
    flags: { ...flags, confirm: true }
  });

  if (apply.status === "apply_failed_validation" && flags.rollbackOnFail) {
    const rollback = await patchCommand({
      args: ["rollback", stage.artifactId],
      flags
    });

    const output = {
      ok: false,
      command: "fix",
      task,
      artifactId: stage.artifactId,
      status: "rolled_back",
      stage,
      validation,
      apply,
      rollback,
      artifact: rollback.artifact || null,
      metrics: buildFixMetrics({ stage, validation, apply, rollback }),
      phaseSummary: buildPhaseSummary({ stage, validation, apply, rollback })
    };
    finishFixRun(logger, run.id, output);
    return output;
  }

  const output = {
    ok: apply.ok,
    command: "fix",
    task,
    artifactId: stage.artifactId,
    status: apply.status,
    stage,
    validation,
    apply,
    rollback: null,
    artifact: apply.artifact || null,
    metrics: buildFixMetrics({ stage, validation, apply, rollback: null }),
    phaseSummary: buildPhaseSummary({ stage, validation, apply, rollback: null })
  };
  finishFixRun(logger, run.id, output);
  return output;
}

function buildFixMetrics({ stage, validation, apply, rollback }) {
  const stageTokens = Number(stage?.usage?.totalTokens || 0);
  const applyTokens = Number(apply?.usage?.totalTokens || 0);

  return {
    stageTokens,
    applyTokens,
    totalTokens: stageTokens + applyTokens,
    selectedTests: Number(stage?.request?.selectedTests?.length || 0),
    changedFiles: Number(apply?.changedFiles?.length || 0),
    rolledBackFiles: Number(rollback?.changedFiles?.length || 0)
  };
}

function buildPhaseSummary({ stage, validation, apply, rollback }) {
  const phases = [];
  if (stage) {
    phases.push({
      phase: "stage",
      status: stage.status || "unknown"
    });
  }
  if (validation) {
    phases.push({
      phase: "validate",
      status: validation.status || "unknown"
    });
  }
  if (apply) {
    phases.push({
      phase: "apply",
      status: apply.status || "unknown"
    });
  }
  if (rollback) {
    phases.push({
      phase: "rollback",
      status: rollback.status || "unknown"
    });
  }
  return phases;
}

function finishFixRun(logger, runId, output) {
  logger.finishRun(runId, {
    status: output.ok ? "completed" : "failed",
    output,
    metrics: output.metrics || {}
  });
}
