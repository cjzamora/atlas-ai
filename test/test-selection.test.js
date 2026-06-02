import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { ensureAtlasRuntime } from "../src/core/runtime.js";
import { scanRepository } from "../src/core/scanner.js";
import { insertRun, updateRun, upsertFiles } from "../src/core/store.js";
import { selectImpactedTests } from "../src/validation/test-selection.js";

const fixtureRoot = path.resolve("test/fixtures/sample-repo");

test("impacted test selection returns relevant tests for pricing changes", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-test-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const impacted = selectImpactedTests(runtime.paths.dbFile, "pricing coupon discount", 5);
    assert.ok(impacted.impactedFiles.includes("src/services/pricing.js"));
    assert.ok(impacted.tests.some((entry) => entry.path === "test/services/pricing.test.js"));
    assert.ok(impacted.tests.some((entry) => entry.path === "test/services/checkout.test.js"));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("impacted test selection ranks the most directly matching pricing test first for pricing bug queries", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-test-ranking-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const impacted = selectImpactedTests(runtime.paths.dbFile, "fix pricing fallback bug", 5);
    assert.equal(impacted.tests[0].path, "test/services/pricing.test.js");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("impacted test selection uses prior confirmed fix memory as a bounded tie-breaker", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-test-memory-boost-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const before = selectImpactedTests(runtime.paths.dbFile, "fix subtotal regression", 5);
    assert.equal(before.tests[0].path, "test/services/checkout.test.js");

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

    const after = selectImpactedTests(runtime.paths.dbFile, "fix subtotal regression", 5);
    assert.equal(after.tests[0].path, "test/services/pricing.test.js");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("impacted test selection prefers direct structural tests over broad umbrella tests", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-test-structural-ranking-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.mkdir(path.join(workingRoot, "src", "core"), { recursive: true });
    await fs.mkdir(path.join(workingRoot, "test"), { recursive: true });

    await fs.writeFile(
      path.join(workingRoot, "src", "core", "scanner.js"),
      [
        "export function analyzeJavaScriptLikeSourceAst() {",
        "  return 'scanner';",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "core", "runtime.js"),
      [
        "export function ensureAtlasRuntime() {",
        "  return 'runtime';",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "core", "execution-builder.js"),
      [
        "import { analyzeJavaScriptLikeSourceAst } from './scanner.js';",
        "import { ensureAtlasRuntime } from './runtime.js';",
        "export function buildExecutionRequest() {",
        "  return [analyzeJavaScriptLikeSourceAst(), ensureAtlasRuntime()].join(':');",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "test", "scanner.test.js"),
      [
        "import { analyzeJavaScriptLikeSourceAst } from '../src/core/scanner.js';",
        "export function scannerTestCase() {",
        "  return analyzeJavaScriptLikeSourceAst();",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "test", "execution.test.js"),
      [
        "import { buildExecutionRequest } from '../src/core/execution-builder.js';",
        "import { analyzeJavaScriptLikeSourceAst } from '../src/core/scanner.js';",
        "import { ensureAtlasRuntime } from '../src/core/runtime.js';",
        "export function executionTestCase() {",
        "  return [buildExecutionRequest(), analyzeJavaScriptLikeSourceAst(), ensureAtlasRuntime()].join(':');",
        "}"
      ].join("\n")
    );

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const impacted = selectImpactedTests(runtime.paths.dbFile, "typescript ast scanner method calls imported services", 5);
    assert.equal(impacted.tests[0].path, "test/scanner.test.js");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
