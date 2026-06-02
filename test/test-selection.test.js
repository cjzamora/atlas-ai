import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { ensureAtlasRuntime } from "../src/core/runtime.js";
import { scanRepository } from "../src/core/scanner.js";
import { upsertFiles } from "../src/core/store.js";
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
