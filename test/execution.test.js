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
import { buildPromptFromBundle } from "../src/core/prompt-builder.js";
import { buildExecutionRequest } from "../src/core/execution-builder.js";

const fixtureRoot = path.resolve("test/fixtures/sample-repo");

test("execution builder packages a model-ready request artifact", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-exec-"));
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
      provider: "openai",
      model: "codex"
    });

    assert.equal(request.provider, "openai");
    assert.equal(request.model, "codex");
    assert.ok(request.requestId);
    assert.ok(request.selectedTests.includes("test/services/pricing.test.js"));
    assert.ok(request.files.some((file) => file.path === "src/services/pricing.js"));
    assert.match(request.prompt, /Atlas Execution Prompt/);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("execution builder carries advisory memory hints into the request artifact", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-exec-memory-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const priorRun = insertRun(runtime.paths.dbFile, {
      command: "fix",
      input: "fix pricing fallback bug",
      metadata: {
        provider: "openai",
        model: "gpt-5.4"
      }
    });
    updateRun(runtime.paths.dbFile, priorRun.id, {
      status: "completed",
      output: {
        command: "fix",
        task: "fix pricing fallback bug",
        status: "confirmed",
        apply: {
          changedFiles: ["src/services/pricing.js"]
        },
        stage: {
          request: {
            selectedTests: ["test/services/pricing.test.js"]
          }
        }
      },
      metrics: {
        totalTokens: 30,
        selectedTests: 1,
        changedFiles: 1
      }
    });

    const task = "fix pricing fallback bug";
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
    const prompt = buildPromptFromBundle(bundle);
    const request = buildExecutionRequest({
      task,
      classification,
      bundle,
      prompt,
      provider: "openai",
      model: "gpt-5.4"
    });

    assert.equal(request.memoryHints.length, 1);
    assert.equal(request.memoryHints[0].outcome, "confirmed");
    assert.ok(request.memoryHints[0].files.includes("src/services/pricing.js"));
    assert.ok(request.memoryHints[0].tests.includes("test/services/pricing.test.js"));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
