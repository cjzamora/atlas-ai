import { ensureAtlasRuntime } from "../core/runtime.js";
import { createRunLogger } from "../core/run-log.js";
import { loadRetrievalEvalSpec, evaluateRetrievalSpec, writeRetrievalEvalReport } from "../core/retrieval-eval.js";

const USAGE = 'Usage: atlas eval retrieval --spec <spec.json> [--report <report.json>] [--fail-under <0..1>] [--root <path>] [--json]';

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
  const threshold = buildThresholdResult(evaluation.summary, flags.failUnder);

  const logger = createRunLogger(runtime.paths.dbFile);
  const run = logger.startRun({
    command: "eval_retrieval",
    input: specFile,
    metadata: {
      specFile,
      caseCount: evaluation.summary.caseCount,
      limit: evaluation.summary.limit,
      failUnder: threshold.minimumEvidenceHitRate
    }
  });

  const output = {
    ok: !threshold.failed,
    command: "eval retrieval",
    specFile,
    threshold,
    ...evaluation
  };

  const reportFile = String(flags.report || "").trim();
  if (reportFile) {
    await writeRetrievalEvalReport(reportFile, output);
    output.reportFile = reportFile;
  }

  logger.finishRun(run.id, {
    status: output.ok ? "completed" : "failed",
    output,
    metrics: {
      caseCount: evaluation.summary.caseCount,
      evidenceHitRate: evaluation.summary.evidenceHitRate,
      testHitRate: evaluation.summary.testHitRate,
      thresholdFailed: threshold.failed ? 1 : 0
    }
  });

  return output;
}

function buildThresholdResult(summary, failUnderValue) {
  const failUnder = Number(failUnderValue);
  const rankQualityFailed = summary.rankQualityPassed === false;
  if (!Number.isFinite(failUnder)) {
    return {
      failed: rankQualityFailed,
      minimumEvidenceHitRate: null,
      minimumTestHitRate: null,
      rankQualityFailed
    };
  }

  const minimum = Math.max(0, Math.min(1, failUnder));
  const evidenceFailed = Number(summary.evidenceHitRate || 0) < minimum;
  const testFailed = Number(summary.testHitRate || 0) < minimum;

  return {
    failed: evidenceFailed || testFailed || rankQualityFailed,
    minimumEvidenceHitRate: minimum,
    minimumTestHitRate: minimum,
    rankQualityFailed
  };
}
