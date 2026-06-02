import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { ensureAtlasRuntime } from "../src/core/runtime.js";
import { scanRepository } from "../src/core/scanner.js";
import { upsertFiles } from "../src/core/store.js";
import { searchEvidence } from "../src/core/retrieval.js";
import { classifyTask, buildPlanArtifact } from "../src/core/planner.js";
import { selectImpactedTests } from "../src/validation/test-selection.js";

const fixtureRoot = path.resolve("test/fixtures/sample-repo");

test("plan artifact includes graph-backed selected tests and validation strategy", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-plan-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const task = "fix pricing coupon discount bug";
    const classification = classifyTask(task);
    const evidence = searchEvidence(runtime.paths.dbFile, task, 5);
    const impacted = selectImpactedTests(runtime.paths.dbFile, task, 5);
    const plan = buildPlanArtifact(task, classification, evidence.matches, impacted);

    assert.equal(plan.validationStrategy.mode, "graph");
    assert.ok(plan.selectedTests.includes("test/services/pricing.test.js"));
    assert.ok(plan.selectedTests.includes("test/services/checkout.test.js"));
    assert.deepEqual(plan.likelyTests, plan.selectedTests);
    assert.ok(plan.validationStrategy.directTests.includes("test/services/pricing.test.js"));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("pricing-focused bug plans rank pricing evidence ahead of downstream checkout files", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-plan-ranking-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const task = "fix pricing fallback bug";
    const classification = classifyTask(task);
    const evidence = searchEvidence(runtime.paths.dbFile, task, 5);
    const impacted = selectImpactedTests(runtime.paths.dbFile, task, 5);
    const plan = buildPlanArtifact(task, classification, evidence.matches, impacted);

    assert.equal(evidence.matches[0].path, "src/services/pricing.js");
    assert.equal(plan.selectedTests[0], "test/services/pricing.test.js");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
