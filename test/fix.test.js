import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { ensureAtlasRuntime } from "../src/core/runtime.js";
import { scanRepository } from "../src/core/scanner.js";
import { getCostReport, upsertFiles } from "../src/core/store.js";
import { fixCommand } from "../src/commands/fix.js";

const fixtureRoot = path.resolve("test/fixtures/sample-repo");

test("fix command stages, validates, applies, and confirms a patch artifact", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-fix-success-"));
  const previousApiKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;

  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    process.env.OPENAI_API_KEY = "test-key";
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: "resp_fix_success",
        status: "completed",
        output_text: [
          "```diff",
          "diff --git a/src/services/pricing.js b/src/services/pricing.js",
          "--- a/src/services/pricing.js",
          "+++ b/src/services/pricing.js",
          "@@ -1,6 +1,6 @@",
          " export function calculateDiscount(coupon, subtotal) {",
          "   if (!coupon || coupon.expired) {",
          "     return 0;",
          "   }",
          " ",
          "-  return Math.min(subtotal, coupon.amountOff || 0);",
          "+  return Math.min(subtotal, coupon.amountOff);",
          " }",
          "```"
        ].join("\n"),
        usage: {
          input_tokens: 10,
          output_tokens: 20,
          total_tokens: 30
        }
      })
    });

    const result = await fixCommand({
      args: ["fix pricing fallback bug"],
      flags: { root: workingRoot, provider: "openai", model: "codex", limit: 5 }
    });

    assert.equal(result.ok, true);
    assert.equal(result.command, "fix");
    assert.equal(result.status, "confirmed");
    assert.equal(result.stage.status, "staged");
    assert.equal(result.validation.status, "passed");
    assert.equal(result.apply.status, "confirmed");
    assert.equal(result.artifact.status, "confirmed");
    assert.equal(result.metrics.totalTokens, 30);
    assert.equal(result.metrics.stageTokens, 30);
    assert.equal(result.metrics.applyTokens, 0);
    assert.ok(result.metrics.selectedTests >= 1);
    assert.ok(Array.isArray(result.phaseSummary));
    assert.equal(result.phaseSummary.length, 3);
    assert.equal(result.phaseSummary[0].phase, "stage");
    assert.equal(result.phaseSummary[1].phase, "validate");
    assert.equal(result.phaseSummary[2].phase, "apply");

    const updatedSource = await fs.readFile(path.join(workingRoot, "src/services/pricing.js"), "utf8");
    assert.match(updatedSource, /Math\.min\(subtotal, coupon\.amountOff\)/);

    const report = getCostReport(runtime.paths.dbFile);
    assert.equal(report.fixRuns, 1);
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousApiKey;
    }
    globalThis.fetch = previousFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("fix command stops before apply when validation fails", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-fix-validation-fail-"));
  const previousApiKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;

  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });
    await fs.writeFile(
      path.join(workingRoot, "test/services/checkout.test.js"),
      [
        "export function checkoutTestCase() {",
        "  throw new Error('checkout regression');",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "test/services/pricing.test.js"),
      [
        "export function pricingTestCase() {",
        "  throw new Error('pricing regression');",
        "}"
      ].join("\n")
    );

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    process.env.OPENAI_API_KEY = "test-key";
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: "resp_fix_validation_fail",
        status: "completed",
        output_text: [
          "```diff",
          "diff --git a/src/services/pricing.js b/src/services/pricing.js",
          "--- a/src/services/pricing.js",
          "+++ b/src/services/pricing.js",
          "@@ -1,6 +1,6 @@",
          " export function calculateDiscount(coupon, subtotal) {",
          "   if (!coupon || coupon.expired) {",
          "     return 0;",
          "   }",
          " ",
          "-  return Math.min(subtotal, coupon.amountOff || 0);",
          "+  return Math.min(subtotal, coupon.amountOff);",
          " }",
          "```"
        ].join("\n"),
        usage: {
          input_tokens: 10,
          output_tokens: 20,
          total_tokens: 30
        }
      })
    });

    const result = await fixCommand({
      args: ["fix pricing fallback bug"],
      flags: { root: workingRoot, provider: "openai", model: "codex", limit: 5 }
    });

    assert.equal(result.ok, false);
    assert.equal(result.command, "fix");
    assert.equal(result.status, "validation_failed");
    assert.equal(result.stage.status, "staged");
    assert.ok(["failed", "skipped"].includes(result.validation.status));
    assert.equal(result.failureReason, null);
    assert.equal(result.apply, null);
    assert.equal(result.metrics.totalTokens, 30);
    assert.equal(result.metrics.stageTokens, 30);
    assert.equal(result.metrics.selectedTests, 0);

    const source = await fs.readFile(path.join(workingRoot, "src/services/pricing.js"), "utf8");
    assert.match(source, /Math\.min\(subtotal, coupon\.amountOff \|\| 0\)/);

    const report = getCostReport(runtime.paths.dbFile);
    assert.equal(report.validationFailedRuns, 1);
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousApiKey;
    }
    globalThis.fetch = previousFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("fix --rollback-on-fail rolls back after post-apply confirmation fails", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-fix-rollback-on-fail-"));
  const previousApiKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;

  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });
    const originalSource = await fs.readFile(path.join(workingRoot, "src/services/pricing.js"), "utf8");

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    process.env.OPENAI_API_KEY = "test-key";
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: "resp_fix_rollback",
        status: "completed",
        output_text: [
          "```diff",
          "diff --git a/src/services/pricing.js b/src/services/pricing.js",
          "--- a/src/services/pricing.js",
          "+++ b/src/services/pricing.js",
          "@@ -1,6 +1,6 @@",
          " export function calculateDiscount(coupon, subtotal) {",
          "   if (!coupon || coupon.expired) {",
          "     return 0;",
          "   }",
          " ",
          "-  return Math.min(subtotal, coupon.amountOff || 0);",
          "+  return Math.min(subtotal, coupon.amountOff);",
          " }",
          "```"
        ].join("\n"),
        usage: {
          input_tokens: 10,
          output_tokens: 20,
          total_tokens: 30
        }
      })
    });

    const originalReadFile = fs.readFile;
    let shouldFailValidation = false;
    fs.readFile = async (targetPath, ...rest) => {
      const resolved = String(targetPath);
      if (
        shouldFailValidation &&
        (resolved.endsWith(path.join("test", "services", "pricing.test.js")) ||
          resolved.endsWith(path.join("test", "services", "checkout.test.js")))
      ) {
        const exportedName = resolved.endsWith(path.join("pricing.test.js"))
          ? "pricingTestCase"
          : "checkoutTestCase";
        return [
          `export function ${exportedName}() {`,
          "  throw new Error('post-apply regression');",
          "}"
        ].join("\n");
      }
      return originalReadFile(targetPath, ...rest);
    };

    const originalPatchConfirm = globalThis.__atlasPatchConfirmHook;
    globalThis.__atlasPatchConfirmHook = () => {
      shouldFailValidation = true;
    };

    const result = await fixCommand({
      args: ["fix pricing fallback bug"],
      flags: { root: workingRoot, provider: "openai", model: "codex", limit: 5, rollbackOnFail: true }
    });

    fs.readFile = originalReadFile;
    globalThis.__atlasPatchConfirmHook = originalPatchConfirm;

    assert.equal(result.ok, false);
    assert.equal(result.command, "fix");
    assert.equal(result.status, "rolled_back");
    assert.equal(result.apply.status, "apply_failed_validation");
    assert.equal(result.rollback.status, "rolled_back");
    assert.equal(result.artifact.status, "rolled_back");
    assert.equal(result.failureReason, "post-apply regression");
    assert.equal(result.metrics.totalTokens, 30);
    assert.equal(result.metrics.rolledBackFiles, 1);
    assert.equal(result.phaseSummary.at(-1).phase, "rollback");

    const restoredSource = await fs.readFile(path.join(workingRoot, "src/services/pricing.js"), "utf8");
    assert.equal(restoredSource, originalSource);

    const report = getCostReport(runtime.paths.dbFile);
    assert.equal(report.rolledBackRuns, 1);
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousApiKey;
    }
    globalThis.fetch = previousFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
