import { ensureAtlasRuntime } from "../core/runtime.js";
import { createRunLogger } from "../core/run-log.js";
import { loadRetrievalEvalSpec, evaluateRetrievalSpec } from "../core/retrieval-eval.js";

const USAGE = 'Usage: atlas eval retrieval --spec <spec.json> [--root <path>] [--json]';

export async function evalCommand({ args, flags }) {
  const subcommand = args[0];
  if (subcommand !== "retrieval") {
    throw new Error(USAGE);
  }

  const specFile = String(flags.spec || "").trim();
  if (!specFile) {
    throw new Error(USAGE);
  }

  const runtime = await ensureAtlasRuntime(flags.root);
  const spec = await loadRetrievalEvalSpec(specFile);
  const evaluation = evaluateRetrievalSpec(runtime.paths.dbFile, spec);

  const logger = createRunLogger(runtime.paths.dbFile);
  const run = logger.startRun({
    command: "eval_retrieval",
    input: specFile,
    metadata: {
      specFile,
      caseCount: evaluation.summary.caseCount,
      limit: evaluation.summary.limit
    }
  });

  const output = {
    ok: true,
    command: "eval retrieval",
    specFile,
    ...evaluation
  };

  logger.finishRun(run.id, {
    status: "completed",
    output,
    metrics: {
      caseCount: evaluation.summary.caseCount,
      evidenceHitRate: evaluation.summary.evidenceHitRate,
      testHitRate: evaluation.summary.testHitRate
    }
  });

  return output;
}
