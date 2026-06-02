import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { ensureAtlasRuntime } from "../src/core/runtime.js";
import { testCommand } from "../src/commands/test.js";
import { readPatchArtifact, writePatchArtifact } from "../src/core/patch-artifact.js";

const sampleFixtureRoot = path.resolve("test/fixtures/sample-repo");
const playgroundRoot = path.resolve("playgrounds/react-nest-demo");

test("test run executes selected JS fixture tests and persists validation results on the artifact", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-validation-js-"));

  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(sampleFixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const artifact = {
      id: "patch-js-validation",
      type: "patch",
      reviewOnly: true,
      task: "validate checkout coupon flow",
      status: "staged",
      createdAt: new Date().toISOString(),
      parseStatus: "parsed",
      patches: [],
      rawOutput: "diff --git a/src/services/pricing.js b/src/services/pricing.js",
      selectedTests: [
        "test/services/pricing.test.js",
        "test/services/checkout.test.js"
      ],
      files: []
    };

    await writePatchArtifact(runtime.paths.artifactsDir, artifact);

    const result = await testCommand({
      args: ["run"],
      flags: { root: workingRoot, artifact: artifact.id }
    });

    assert.equal(result.ok, true);
    assert.equal(result.command, "test run");
    assert.equal(result.status, "passed");
    assert.equal(result.results.length, 2);
    assert.equal(result.summary.passed, 2);
    assert.equal(result.summary.failed, 0);

    const stored = await readPatchArtifact(runtime.paths.artifactsDir, artifact.id);
    assert.equal(stored.status, "validated");
    assert.equal(stored.validation.status, "passed");
    assert.equal(stored.validation.summary.passed, 2);
    assert.equal(stored.validation.results.length, 2);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("test run executes selected TypeScript fixture tests through the artifact workflow", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-validation-ts-"));

  try {
    const workingRoot = path.join(tempRoot, "react-nest-demo");
    await fs.cp(playgroundRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const artifact = {
      id: "patch-ts-validation",
      type: "patch",
      reviewOnly: true,
      task: "validate expired coupon checkout flow",
      status: "staged",
      createdAt: new Date().toISOString(),
      parseStatus: "parsed",
      patches: [],
      rawOutput: "diff --git a/apps/api/src/checkout/checkout.service.ts b/apps/api/src/checkout/checkout.service.ts",
      selectedTests: [
        "tests/api/pricing.service.test.ts",
        "tests/api/checkout.service.test.ts",
        "tests/web/checkout-page.test.ts"
      ],
      files: []
    };

    await writePatchArtifact(runtime.paths.artifactsDir, artifact);

    const result = await testCommand({
      args: ["run"],
      flags: { root: workingRoot, artifact: artifact.id }
    });

    assert.equal(result.ok, true);
    assert.equal(result.command, "test run");
    assert.equal(result.status, "passed");
    assert.equal(result.results.length, 3);
    assert.equal(result.summary.passed, 3);
    assert.equal(result.summary.failed, 0);

    const stored = await readPatchArtifact(runtime.paths.artifactsDir, artifact.id);
    assert.equal(stored.status, "validated");
    assert.equal(stored.validation.status, "passed");
    assert.equal(stored.validation.summary.passed, 3);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
