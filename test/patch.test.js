import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { ensureAtlasRuntime } from "../src/core/runtime.js";
import { scanRepository } from "../src/core/scanner.js";
import { upsertFiles } from "../src/core/store.js";
import { parsePatchResponse } from "../src/core/patch-artifact.js";
import { patchCommand } from "../src/commands/patch.js";

const fixtureRoot = path.resolve("test/fixtures/sample-repo");

test("parsePatchResponse extracts fenced diffs and preserves raw output", () => {
  const rawOutput = [
    "Here is the change:",
    "",
    "```diff",
    "diff --git a/src/services/pricing.js b/src/services/pricing.js",
    "--- a/src/services/pricing.js",
    "+++ b/src/services/pricing.js",
    "@@ -1,3 +1,3 @@",
    "-const discount = coupon.value;",
    "+const discount = Math.min(coupon.value, subtotal);",
    "```",
    "",
    "Run npm test."
  ].join("\n");

  const parsed = parsePatchResponse(rawOutput);

  assert.equal(parsed.rawOutput, rawOutput);
  assert.equal(parsed.parseStatus, "parsed");
  assert.equal(parsed.patches.length, 1);
  assert.match(parsed.patches[0].diff, /diff --git/);
  assert.match(parsed.patches[0].diff, /Math\.min/);
});

test("parsePatchResponse keeps unstructured responses as raw artifacts", () => {
  const rawOutput = "I would update pricing validation, but no patch is included.";
  const parsed = parsePatchResponse(rawOutput);

  assert.equal(parsed.rawOutput, rawOutput);
  assert.equal(parsed.parseStatus, "unstructured");
  assert.deepEqual(parsed.patches, []);
});

test("patch stage writes a review-only artifact and patch show returns it", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-patch-stage-"));
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
        id: "resp_patch_1",
        status: "completed",
        output_text: [
          "```diff",
          "diff --git a/src/services/pricing.js b/src/services/pricing.js",
          "--- a/src/services/pricing.js",
          "+++ b/src/services/pricing.js",
          "@@ -1,3 +1,3 @@",
          "-const total = subtotal - discount;",
          "+const total = Math.max(0, subtotal - discount);",
          "```"
        ].join("\n"),
        usage: {
          input_tokens: 10,
          output_tokens: 20,
          total_tokens: 30
        }
      })
    });

    const staged = await patchCommand({
      args: ["stage", "fix pricing discount underflow"],
      flags: { root: workingRoot, provider: "openai", model: "codex", limit: 5 }
    });

    assert.equal(staged.ok, true);
    assert.equal(staged.command, "patch stage");
    assert.equal(staged.status, "staged");
    assert.equal(staged.artifact.reviewOnly, true);
    assert.equal(staged.artifact.parseStatus, "parsed");
    assert.equal(staged.artifact.patches.length, 1);
    assert.match(staged.artifactId, /^patch-[a-f0-9]{12}$/);

    const artifactPath = path.join(workingRoot, ".atlas", "artifacts", `${staged.artifactId}.json`);
    const stored = JSON.parse(await fs.readFile(artifactPath, "utf8"));
    assert.equal(stored.rawOutput, staged.artifact.rawOutput);
    assert.equal(stored.reviewOnly, true);

    const shown = await patchCommand({
      args: ["show", staged.artifactId],
      flags: { root: workingRoot }
    });

    assert.equal(shown.ok, true);
    assert.equal(shown.command, "patch show");
    assert.equal(shown.artifact.id, staged.artifactId);
    assert.equal(shown.artifact.rawOutput, staged.artifact.rawOutput);
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
