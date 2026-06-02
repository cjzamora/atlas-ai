import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { ensureAtlasRuntime } from "../src/core/runtime.js";
import { scanRepository } from "../src/core/scanner.js";
import { getCostReport, upsertFiles } from "../src/core/store.js";
import { testCommand } from "../src/commands/test.js";

test("test missrate reports failures selection would have missed and records a rolling rate", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-missrate-"));
  try {
    const workingRoot = path.join(tempRoot, "repo");
    await fs.mkdir(path.join(workingRoot, "src", "services"), { recursive: true });
    await fs.mkdir(path.join(workingRoot, "test", "services"), { recursive: true });

    await fs.writeFile(
      path.join(workingRoot, "src", "services", "alpha.js"),
      "export function computeAlpha(value) {\n  return value + 1;\n}\n"
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "services", "beta.js"),
      "export function computeBeta(value) {\n  return value + 2;\n}\n"
    );
    // Both tests fail; only the alpha test is impacted by the "alpha" query, so the
    // beta failure is the one selection misses.
    await fs.writeFile(
      path.join(workingRoot, "test", "services", "alpha.test.js"),
      [
        "import { computeAlpha } from '../../src/services/alpha.js';",
        "export function alphaTestCase() {",
        "  computeAlpha(1);",
        "  throw new Error('alpha boom');",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "test", "services", "beta.test.js"),
      [
        "import { computeBeta } from '../../src/services/beta.js';",
        "export function betaTestCase() {",
        "  computeBeta(1);",
        "  throw new Error('beta boom');",
        "}"
      ].join("\n")
    );

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    // Query targets only alpha, so the beta failure is genuinely outside selection.
    const result = await testCommand({
      args: ["missrate", "alpha"],
      flags: { root: workingRoot, limit: 5 }
    });

    assert.equal(result.ok, true);
    assert.equal(result.command, "test missrate");
    assert.equal(result.totalTestFiles, 2);
    assert.equal(result.failingTests.length, 2);
    assert.ok(result.selectedTests.includes("test/services/alpha.test.js"));
    assert.ok(!result.selectedTests.includes("test/services/beta.test.js"));
    assert.ok(result.coveredFailures.includes("test/services/alpha.test.js"));
    assert.deepEqual(result.missedFailures, ["test/services/beta.test.js"]);
    assert.equal(result.missRate, 0.5);

    const report = getCostReport(runtime.paths.dbFile);
    assert.equal(report.selectionMissRate.samples, 1);
    assert.equal(report.selectionMissRate.averageMissRate, 0.5);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
