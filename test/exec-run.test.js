import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { ensureAtlasRuntime } from "../src/core/runtime.js";
import { scanRepository } from "../src/core/scanner.js";
import { upsertFiles, listRuns } from "../src/core/store.js";
import { execCommand } from "../src/commands/exec.js";

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
