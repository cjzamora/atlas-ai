import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { ensureAtlasRuntime } from "../src/core/runtime.js";
import { scanRepository } from "../src/core/scanner.js";
import { findRelevantRunPatterns, insertRun, updateRun, upsertFiles } from "../src/core/store.js";
import { searchEvidence } from "../src/core/retrieval.js";
import { classifyTask, buildPlanArtifact } from "../src/core/planner.js";
import { selectImpactedTests } from "../src/validation/test-selection.js";
import { buildContextBundle } from "../src/core/context-builder.js";

const fixtureRoot = path.resolve("test/fixtures/sample-repo");

test("context bundle includes likely files, selected tests, and source excerpts", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-context-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const task = "fix metering ticket tally bug";
    const classification = classifyTask(task);
    const evidence = searchEvidence(runtime.paths.dbFile, task, 5);
    const impacted = selectImpactedTests(runtime.paths.dbFile, task, 5);
    const plan = buildPlanArtifact(task, classification, evidence.matches, impacted);
    const bundle = await buildContextBundle({
      rootDir: runtime.rootDir,
      task,
      classification,
      evidenceMatches: evidence.matches,
      plan
    });

    assert.equal(bundle.task, task);
    assert.ok(bundle.selectedTests.includes("test/services/metering.test.js"));
    assert.ok(bundle.files.some((file) => file.role === "primary" && file.path === "src/services/metering.js"));
    assert.ok(bundle.files.some((file) => file.role === "selected_test" && file.path === "test/services/metering.test.js"));
    assert.ok(bundle.files.every((file) => typeof file.excerpt === "string"));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("context bundle includes compact memory hints from prior confirmed fixes", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-context-memory-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const priorRun = insertRun(runtime.paths.dbFile, {
      command: "fix",
      input: "fix metering fallback bug",
      metadata: {
        provider: "openai",
        model: "gpt-5.4"
      }
    });
    updateRun(runtime.paths.dbFile, priorRun.id, {
      status: "completed",
      output: {
        command: "fix",
        task: "fix metering fallback bug",
        status: "confirmed",
        apply: {
          changedFiles: ["src/services/metering.js"]
        },
        stage: {
          request: {
            selectedTests: ["test/services/metering.test.js"]
          }
        }
      },
      metrics: {
        totalTokens: 30,
        selectedTests: 1,
        changedFiles: 1
      }
    });

    const task = "fix metering fallback bug";
    const classification = classifyTask(task);
    const evidence = searchEvidence(runtime.paths.dbFile, task, 5);
    const impacted = selectImpactedTests(runtime.paths.dbFile, task, 5);
    const priorPatterns = findRelevantRunPatterns(runtime.paths.dbFile, task, 3);
    const plan = buildPlanArtifact(task, classification, evidence.matches, impacted, priorPatterns);
    const bundle = await buildContextBundle({
      rootDir: runtime.rootDir,
      task,
      classification,
      evidenceMatches: evidence.matches,
      plan
    });

    assert.equal(bundle.memoryHints.length, 1);
    assert.equal(bundle.memoryHints[0].outcome, "confirmed");
    assert.ok(bundle.memoryHints[0].files.includes("src/services/metering.js"));
    assert.ok(bundle.memoryHints[0].tests.includes("test/services/metering.test.js"));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
