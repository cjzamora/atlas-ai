import { ensureAtlasRuntime } from "../core/runtime.js";
import { selectImpactedTests } from "../validation/test-selection.js";
import { runSelectedTests } from "../validation/test-runner.js";
import { measureSelectionMissRate } from "../validation/miss-rate.js";
import { createRunLogger } from "../core/run-log.js";
import { readPatchArtifact, updatePatchArtifact } from "../core/patch-artifact.js";

export async function testCommand({ args, flags }) {
  const subcommand = args[0];
  if (subcommand === "impacted") {
    return impactedTests({ args: args.slice(1), flags });
  }
  if (subcommand === "run") {
    return runArtifactTests({ flags });
  }
  if (subcommand === "missrate") {
    return measureMissRate({ args: args.slice(1), flags });
  }

  throw new Error('Usage: atlas test impacted "<query>"\n       atlas test run --artifact <artifact-id>\n       atlas test missrate "<query>"');
}

async function measureMissRate({ args, flags }) {
  const query = args.join(" ").trim();
  if (!query) {
    throw new Error('Usage: atlas test missrate "<query>"');
  }

  const runtime = await ensureAtlasRuntime(flags.root);
  const limit = Number(flags.limit || 10);
  const logger = createRunLogger(runtime.paths.dbFile);
  const run = logger.startRun({
    command: "test_missrate",
    input: query,
    metadata: { validationMode: "missrate" }
  });

  const result = await measureSelectionMissRate({
    rootDir: runtime.rootDir,
    dbFile: runtime.paths.dbFile,
    query,
    limit
  });

  const output = {
    ok: true,
    command: "test missrate",
    query,
    selectedTests: result.selectedTests,
    totalTestFiles: result.totalTestFiles,
    failingTests: result.failingTests,
    coveredFailures: result.coveredFailures,
    missedFailures: result.missedFailures,
    missRate: result.missRate,
    fullSummary: result.fullSummary
  };

  logger.finishRun(run.id, {
    status: "completed",
    output,
    metrics: {
      missRate: result.missRate,
      selectedTests: result.selectedTests.length,
      failingTests: result.failingTests.length,
      missedFailures: result.missedFailures.length,
      totalTestFiles: result.totalTestFiles
    }
  });

  return output;
}

async function impactedTests({ args, flags }) {
  const query = args.join(" ").trim();
  if (!query) {
    throw new Error('Usage: atlas test impacted "<query>"');
  }

  const runtime = await ensureAtlasRuntime(flags.root);
  const limit = Number(flags.limit || 10);
  const result = selectImpactedTests(runtime.paths.dbFile, query, limit);

  return {
    ok: true,
    command: "test impacted",
    query,
    impactedFiles: result.impactedFiles,
    tests: result.tests,
    message: result.impactedFiles.length === 0
      ? "No indexed impacted files found. Run `atlas index` for this repo first or broaden the query."
      : undefined
  };
}

async function runArtifactTests({ flags }) {
  const artifactId = String(flags.artifact || "").trim();
  if (!artifactId) {
    throw new Error("Usage: atlas test run --artifact <artifact-id>");
  }

  const runtime = await ensureAtlasRuntime(flags.root);
  const artifact = await readPatchArtifact(runtime.paths.artifactsDir, artifactId);
  const logger = createRunLogger(runtime.paths.dbFile);
  const run = logger.startRun({
    command: "test_run",
    input: artifact.task || artifactId,
    metadata: {
      artifactId,
      selectedTests: artifact.selectedTests || [],
      validationMode: "artifact"
    }
  });

  const validation = await runSelectedTests({
    rootDir: runtime.rootDir,
    selectedTests: artifact.selectedTests || []
  });

  const nextStatus = validation.status === "passed"
    ? "validated"
    : validation.status === "failed"
      ? "validation_failed"
      : "validation_skipped";

  const updatedArtifact = await updatePatchArtifact(runtime.paths.artifactsDir, artifactId, (current) => ({
    ...current,
    status: nextStatus,
    validation
  }));

  const output = {
    ok: true,
    command: "test run",
    artifactId,
    task: updatedArtifact.task,
    status: validation.status,
    failureReason: validation.failureReason || null,
    summary: validation.summary,
    results: validation.results,
    validation
  };

  logger.finishRun(run.id, {
    status: validation.status === "failed" ? "failed" : "completed",
    output,
    metrics: {
      artifactId,
      selectedTests: (artifact.selectedTests || []).length,
      passedTests: validation.summary.passed,
      failedTests: validation.summary.failed,
      skippedTests: validation.summary.skipped
    }
  });

  return {
    ...output,
    artifact: updatedArtifact
  };
}
