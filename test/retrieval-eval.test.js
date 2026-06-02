import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { ensureAtlasRuntime } from "../src/core/runtime.js";
import { scanRepository } from "../src/core/scanner.js";
import { searchEvidence } from "../src/core/retrieval.js";
import { insertRun, updateRun, upsertFiles } from "../src/core/store.js";
import { evalCommand } from "../src/commands/eval.js";

const fixtureRoot = path.resolve("test/fixtures/sample-repo");
const holdoutRoot = path.resolve("playgrounds/holdout-js-eventbus");

test("eval retrieval reports hit metrics for evidence and impacted tests from a spec file", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-eval-retrieval-"));

  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const specFile = path.join(tempRoot, "retrieval-spec.json");
    await fs.writeFile(
      specFile,
      JSON.stringify({
        limit: 5,
        cases: [
          {
            query: "metering ticket tally",
            expectedEvidence: ["src/services/metering.js"],
            expectedTests: ["test/services/metering.test.js"]
          },
          {
            query: "intake apply ticket",
            expectedEvidence: ["src/services/intake.js"],
            expectedTests: ["test/services/intake.test.js"]
          }
        ]
      }, null, 2)
    );

    const result = await evalCommand({
      args: ["retrieval"],
      flags: { root: workingRoot, spec: specFile }
    });

    assert.equal(result.ok, true);
    assert.equal(result.command, "eval retrieval");
    assert.equal(result.summary.caseCount, 2);
    assert.equal(result.summary.evidenceHitRate, 1);
    assert.equal(result.summary.testHitRate, 1);
    assert.equal(result.cases[0].evidence.hit, true);
    assert.equal(result.cases[0].tests.hit, true);
    assert.ok(result.cases[0].evidence.topMatches.includes("src/services/metering.js"));
    assert.ok(result.cases[0].evidence.rank >= 1);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("eval retrieval surfaces misses when expected files are not retrieved", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-eval-retrieval-miss-"));

  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const specFile = path.join(tempRoot, "retrieval-miss-spec.json");
    await fs.writeFile(
      specFile,
      JSON.stringify({
        limit: 3,
        cases: [
          {
            query: "metering ticket tally",
            expectedEvidence: ["src/controllers/does-not-exist.js"],
            expectedTests: ["test/services/does-not-exist.test.js"]
          }
        ]
      }, null, 2)
    );

    const result = await evalCommand({
      args: ["retrieval"],
      flags: { root: workingRoot, spec: specFile }
    });

    assert.equal(result.ok, true);
    assert.equal(result.summary.caseCount, 1);
    assert.equal(result.summary.evidenceHitRate, 0);
    assert.equal(result.summary.testHitRate, 0);
    assert.equal(result.cases[0].evidence.hit, false);
    assert.equal(result.cases[0].tests.hit, false);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("eval retrieval writes a report file and flags threshold failures", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-eval-retrieval-report-"));

  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const specFile = path.join(tempRoot, "retrieval-threshold-spec.json");
    const reportFile = path.join(tempRoot, "retrieval-report.json");
    await fs.writeFile(
      specFile,
      JSON.stringify({
        limit: 3,
        cases: [
          {
            query: "metering ticket tally",
            expectedEvidence: ["src/controllers/does-not-exist.js"],
            expectedTests: ["test/services/does-not-exist.test.js"]
          }
        ]
      }, null, 2)
    );

    const result = await evalCommand({
      args: ["retrieval"],
      flags: {
        root: workingRoot,
        spec: specFile,
        report: reportFile,
        failUnder: "0.75"
      }
    });

    assert.equal(result.ok, false);
    assert.equal(result.threshold.failed, true);
    assert.equal(result.threshold.minimumEvidenceHitRate, 0.75);
    assert.equal(result.threshold.minimumTestHitRate, 0.75);
    assert.equal(result.reportFile, reportFile);

    const report = JSON.parse(await fs.readFile(reportFile, "utf8"));
    assert.equal(report.command, "eval retrieval");
    assert.equal(report.ok, false);
    assert.equal(report.threshold.failed, true);
    assert.equal(report.summary.evidenceHitRate, 0);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("eval retrieval check-report fails when an archived report is stale", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-eval-retrieval-report-check-"));

  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const specFile = path.join(tempRoot, "retrieval-report-check-spec.json");
    const reportFile = path.join(tempRoot, "retrieval-report.json");
    await fs.writeFile(
      specFile,
      JSON.stringify({
        limit: 5,
        cases: [
          {
            query: "metering ticket tally",
            expectedEvidence: ["src/services/metering.js"],
            expectedTests: ["test/services/metering.test.js"]
          }
        ]
      }, null, 2)
    );
    await fs.writeFile(reportFile, JSON.stringify({ ok: true, stale: true }, null, 2));

    const result = await evalCommand({
      args: ["retrieval"],
      flags: {
        root: workingRoot,
        spec: specFile,
        report: reportFile,
        checkReport: true
      }
    });

    const persistedReport = JSON.parse(await fs.readFile(reportFile, "utf8"));
    assert.equal(result.ok, false);
    assert.equal(result.reportCheck.checked, true);
    assert.equal(result.reportCheck.passed, false);
    assert.equal(result.threshold.reportStale, true);
    assert.deepEqual(persistedReport, { ok: true, stale: true });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("eval retrieval includes JSON diagnostics for impacted test ranking", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-eval-retrieval-diagnostics-"));

  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const specFile = path.join(tempRoot, "retrieval-diagnostics-spec.json");
    await fs.writeFile(
      specFile,
      JSON.stringify({
        limit: 5,
        cases: [
          {
            query: "metering ticket tally",
            expectedEvidence: ["src/services/metering.js"],
            expectedTests: ["test/services/metering.test.js"]
          }
        ]
      }, null, 2)
    );

    const result = await evalCommand({
      args: ["retrieval"],
      flags: { root: workingRoot, spec: specFile }
    });

    const diagnostics = result.cases[0].tests.diagnostics;
    assert.ok(Array.isArray(diagnostics.topMatches));
    assert.equal(diagnostics.topMatches[0].path, "test/services/metering.test.js");
    assert.equal(typeof diagnostics.topMatches[0].score, "number");
    assert.ok(diagnostics.topMatches[0].covers.includes("src/services/metering.js"));
    assert.equal(typeof diagnostics.topMatches[0].scoreBreakdown.pathMatch, "number");
    assert.equal(typeof diagnostics.topMatches[0].scoreBreakdown.directCoverage, "number");
    assert.equal(typeof diagnostics.topMatches[0].scoreBreakdown.coverageContribution, "number");
    assert.equal(typeof diagnostics.topMatches[0].scoreBreakdown.specificityPenalty, "number");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("eval retrieval fails rank quality checks independently of hit-rate thresholds", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-eval-retrieval-rank-quality-"));

  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const specFile = path.join(tempRoot, "retrieval-rank-quality-spec.json");
    await fs.writeFile(
      specFile,
      JSON.stringify({
        limit: 5,
        cases: [
          {
            query: "metering ticket tally",
            expectedEvidence: ["src/services/metering.js"],
            expectedTests: ["test/services/metering.test.js"],
            maxTestRank: 0
          }
        ]
      }, null, 2)
    );

    const result = await evalCommand({
      args: ["retrieval"],
      flags: {
        root: workingRoot,
        spec: specFile,
        failUnder: "1"
      }
    });

    assert.equal(result.summary.evidenceHitRate, 1);
    assert.equal(result.summary.testHitRate, 1);
    assert.equal(result.cases[0].tests.hit, true);
    assert.equal(result.cases[0].quality.passed, false);
    assert.equal(result.cases[0].quality.failures[0].type, "maxTestRank");
    assert.equal(result.threshold.rankQualityFailed, true);
    assert.equal(result.ok, false);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("eval retrieval passes against the committed held-out baseline", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-eval-holdout-baseline-"));

  try {
    const workingRoot = path.join(tempRoot, "holdout-js-eventbus");
    await fs.cp(holdoutRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const result = await evalCommand({
      args: ["retrieval"],
      flags: {
        root: workingRoot,
        spec: path.resolve("evals/retrieval/holdout-js-eventbus.spec.json"),
        failUnder: "1"
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.summary.caseCount, 5);
    assert.equal(result.summary.evidenceHitRate, 1);
    assert.equal(result.summary.testHitRate, 1);
    assert.equal(result.summary.rankQualityPassed, true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("eval retrieval check-report passes against the committed held-out archive", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-eval-holdout-report-check-"));

  try {
    const workingRoot = path.join(tempRoot, "holdout-js-eventbus");
    await fs.cp(holdoutRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const result = await evalCommand({
      args: ["retrieval"],
      flags: {
        root: workingRoot,
        spec: "evals/retrieval/holdout-js-eventbus.spec.json",
        report: "archive/holdout-js-eventbus-retrieval-report.json",
        failUnder: "1",
        checkReport: true
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.reportCheck.checked, true);
    assert.equal(result.reportCheck.passed, true);
    assert.equal(result.threshold.reportStale, false);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("eval retrieval reports bounded memory assistance for held-out cases", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-eval-holdout-memory-"));

  try {
    const workingRoot = path.join(tempRoot, "holdout-js-eventbus");
    await fs.cp(holdoutRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const confirmedRun = insertRun(runtime.paths.dbFile, {
      command: "fix",
      input: "fix subscribe publish on the event bus",
      metadata: {
        provider: "openai",
        model: "gpt-5.4"
      }
    });
    updateRun(runtime.paths.dbFile, confirmedRun.id, {
      status: "completed",
      output: {
        command: "fix",
        task: "fix subscribe publish on the event bus",
        status: "confirmed",
        apply: {
          changedFiles: ["src/event-bus.js"]
        },
        stage: {
          request: {
            selectedTests: ["test/event-bus.test.js"]
          }
        }
      },
      metrics: {
        selectedTests: 1,
        changedFiles: 1
      }
    });

    const rolledBackRun = insertRun(runtime.paths.dbFile, {
      command: "fix",
      input: "fix subscribe publish on the event bus",
      metadata: {
        provider: "openai",
        model: "gpt-5.4"
      }
    });
    updateRun(runtime.paths.dbFile, rolledBackRun.id, {
      status: "failed",
      output: {
        command: "fix",
        task: "fix subscribe publish on the event bus",
        status: "rolled_back",
        rollback: {
          changedFiles: ["src/subscription.js"]
        }
      },
      metrics: {
        rolledBackFiles: 1
      }
    });

    const result = await evalCommand({
      args: ["retrieval"],
      flags: {
        root: workingRoot,
        spec: path.resolve("evals/retrieval/holdout-js-eventbus.spec.json"),
        failUnder: "1"
      }
    });

    const pubsubCase = result.cases.find((entry) => entry.id === "eventbus-pubsub");
    assert.equal(result.ok, true);
    assert.equal(pubsubCase.memoryAssistance.retrievalBoostApplied, true);
    assert.equal(pubsubCase.memoryAssistance.testBoostApplied, true);
    assert.equal(pubsubCase.memoryAssistance.ignoredPatternCount >= 1, true);
    assert.ok(pubsubCase.memoryAssistance.ignoredOutcomes.includes("rolled_back"));
    assert.ok(pubsubCase.memoryAssistance.boostedPaths.includes("src/event-bus.js"));
    assert.ok(pubsubCase.memoryAssistance.boostedTests.includes("test/event-bus.test.js"));
    assert.equal(pubsubCase.memoryAssistance.topEvidenceMemoryBoosted, true);
    assert.equal(pubsubCase.memoryAssistance.topTestMemoryBoosted, true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("confirmed memory stays bounded behind stronger held-out evidence", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-eval-holdout-memory-bound-"));

  try {
    const workingRoot = path.join(tempRoot, "holdout-js-eventbus");
    await fs.cp(holdoutRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const priorRun = insertRun(runtime.paths.dbFile, {
      command: "fix",
      input: "fix cache handling in the event bus",
      metadata: {
        provider: "openai",
        model: "gpt-5.4"
      }
    });
    updateRun(runtime.paths.dbFile, priorRun.id, {
      status: "completed",
      output: {
        command: "fix",
        task: "fix cache handling in the event bus",
        status: "confirmed",
        apply: {
          changedFiles: ["src/event-bus.js"]
        },
        stage: {
          request: {
            selectedTests: ["test/event-bus.test.js"]
          }
        }
      },
      metrics: {
        selectedTests: 1,
        changedFiles: 1
      }
    });

    const evidence = searchEvidence(runtime.paths.dbFile, "ttl cache get set evict", 5);

    assert.equal(evidence.memoryAssistance.retrievalBoostApplied, true);
    assert.ok(evidence.memoryAssistance.boostedPaths.includes("src/event-bus.js"));
    assert.equal(evidence.matches[0].path, "src/cache-store.js");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
