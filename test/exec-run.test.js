import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { ensureAtlasRuntime } from "../src/core/runtime.js";
import { scanRepository } from "../src/core/scanner.js";
import { upsertFiles, listRuns } from "../src/core/store.js";
import { execCommand } from "../src/commands/exec.js";
import { readPatchArtifact } from "../src/core/patch-artifact.js";

const fixtureRoot = path.resolve("test/fixtures/sample-repo");

test("exec run returns a logged failure when OPENAI_API_KEY is missing", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-exec-run-"));
  const previousApiKey = process.env.OPENAI_API_KEY;

  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    delete process.env.OPENAI_API_KEY;

    const result = await execCommand({
      args: ["run", "fix pricing coupon discount bug"],
      flags: { root: workingRoot, provider: "openai", model: "codex" }
    });

    assert.equal(result.ok, false);
    assert.equal(result.command, "exec run");
    assert.equal(result.status, "failed");
    assert.equal(result.error.code, "missing_api_key");

    const runs = listRuns(runtime.paths.dbFile, 5);
    assert.equal(runs[0].command, "exec_run");
    assert.equal(runs[0].status, "failed");
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousApiKey;
    }
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("exec handoff builds a logged manual Codex handoff artifact", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-exec-handoff-"));

  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const result = await execCommand({
      args: ["handoff", "fix pricing coupon discount bug"],
      flags: { root: workingRoot, provider: "codex" }
    });

    assert.equal(result.ok, true);
    assert.equal(result.command, "exec handoff");
    assert.equal(result.status, "prepared");
    assert.equal(result.handoff.provider, "codex");
    assert.equal(result.handoff.mode, "manual");
    assert.match(result.handoff.promptText, /Atlas Execution Prompt/);
    assert.ok(Array.isArray(result.handoff.instructions));
    assert.ok(result.handoff.instructions.length > 0);

    const runs = listRuns(runtime.paths.dbFile, 5);
    assert.equal(runs[0].command, "exec_handoff");
    assert.equal(runs[0].status, "completed");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("exec import stages an external Codex response as a patch artifact", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-exec-import-"));

  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const responseFile = path.join(tempRoot, "codex-response.txt");
    await fs.writeFile(
      responseFile,
      [
        "Likely root cause: pricing clamp is missing.",
        "",
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
      ].join("\n")
    );

    const result = await execCommand({
      args: ["import", "fix pricing coupon discount bug"],
      flags: { root: workingRoot, provider: "codex", file: responseFile }
    });

    assert.equal(result.ok, true);
    assert.equal(result.command, "exec import");
    assert.equal(result.status, "staged");
    assert.equal(result.artifact.provider, "codex");
    assert.equal(result.artifact.parseStatus, "parsed");
    assert.equal(result.artifact.patches.length, 1);
    assert.equal(result.artifact.importSource.type, "file");
    assert.equal(result.artifact.importSource.path, responseFile);

    const storedArtifact = await readPatchArtifact(runtime.paths.artifactsDir, result.artifactId);
    assert.equal(storedArtifact.id, result.artifactId);
    assert.equal(storedArtifact.provider, "codex");
    assert.equal(storedArtifact.importSource.path, responseFile);

    const runs = listRuns(runtime.paths.dbFile, 5);
    assert.equal(runs[0].command, "exec_import");
    assert.equal(runs[0].status, "completed");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
