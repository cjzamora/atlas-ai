import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { ensureAtlasRuntime } from "../src/core/runtime.js";
import { scanRepository } from "../src/core/scanner.js";
import { upsertFiles } from "../src/core/store.js";
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

    const updatedSource = await fs.readFile(path.join(workingRoot, "src/services/pricing.js"), "utf8");
    assert.match(updatedSource, /Math\.min\(subtotal, coupon\.amountOff\)/);
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
    assert.equal(result.apply, null);

    const source = await fs.readFile(path.join(workingRoot, "src/services/pricing.js"), "utf8");
    assert.match(source, /Math\.min\(subtotal, coupon\.amountOff \|\| 0\)/);
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
