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

test("context bundle centers the excerpt on the matched symbol, not the file head", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-context-window-"));
  try {
    const workingRoot = path.join(tempRoot, "wide-repo");
    await fs.mkdir(path.join(workingRoot, "src", "services"), { recursive: true });

    // A file large enough that head-truncation (first 1400 chars) would never reach
    // the target symbol, which lives at the very end.
    const filler = Array.from({ length: 90 }, (_, index) => `const filler${index} = ${index};`).join("\n");
    const wideSource = [
      "// HEAD_MARKER top of file",
      filler,
      "export function targetSymbol(input) {",
      "  // TARGET_REGION unique marker",
      "  return input * 2;",
      "}"
    ].join("\n");
    await fs.writeFile(path.join(workingRoot, "src", "services", "wide.js"), wideSource);

    const task = "improve targetSymbol scaling";
    const plan = {
      summary: "scale target symbol",
      likelyFiles: ["src/services/wide.js"],
      relatedDependencies: [],
      selectedTests: [],
      callHints: [],
      priorPatterns: [],
      memoryAssistance: {
        matchedPatternCount: 0,
        retrievalBoostApplied: false,
        testBoostApplied: false,
        boostedPaths: [],
        boostedTests: []
      },
      validationStrategy: { mode: "none", rationale: "", directTests: [], expandedTests: [] },
      codexNeeded: false
    };
    const evidenceMatches = [
      { path: "src/services/wide.js", symbol: "targetSymbol", summary: "wide module" }
    ];

    const bundle = await buildContextBundle({
      rootDir: workingRoot,
      task,
      classification: classifyTask(task),
      evidenceMatches,
      plan
    });

    const wide = bundle.files.find((file) => file.path === "src/services/wide.js");
    assert.ok(wide, "wide.js should be in the bundle");
    assert.ok(wide.excerpt.includes("targetSymbol"), "excerpt should contain the matched symbol");
    assert.ok(wide.excerpt.includes("TARGET_REGION"), "excerpt should contain the symbol's body");
    assert.ok(!wide.excerpt.includes("HEAD_MARKER"), "excerpt should not be anchored at the file head");
    assert.ok(wide.excerpt.startsWith("..."), "excerpt should mark a non-head window");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
