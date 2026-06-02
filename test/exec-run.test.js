import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { ensureAtlasRuntime } from "../src/core/runtime.js";
import { scanRepository } from "../src/core/scanner.js";
import { upsertFiles, listRuns } from "../src/core/store.js";
import { querySql } from "../src/core/sqlite.js";
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
      args: ["run", "fix metering ticket tally bug"],
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

test("exec run retries transient provider failures and succeeds on a later attempt", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-exec-run-retry-"));
  const previousApiKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;

  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    process.env.OPENAI_API_KEY = "test-key";
    let attempts = 0;
    globalThis.fetch = async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("temporary network failure");
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "resp_exec_retry",
          status: "completed",
          output_text: "Proposed fix",
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            total_tokens: 30
          }
        })
      };
    };

    const result = await execCommand({
      args: ["run", "fix metering ticket tally bug"],
      flags: { root: workingRoot, provider: "openai", model: "gpt-5.4" }
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "completed");
    assert.equal(result.response.text, "Proposed fix");
    assert.equal(result.retry.attemptCount, 2);
    assert.equal(result.retry.retried, true);
    assert.equal(attempts, 2);

    const runs = listRuns(runtime.paths.dbFile, 5);
    assert.equal(runs[0].command, "exec_run");
    assert.equal(runs[0].status, "completed");
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

test("exec run records normalized retry exhaustion details for provider failures", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-exec-run-retry-exhausted-"));
  const previousApiKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;

  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    process.env.OPENAI_API_KEY = "test-key";
    let attempts = 0;
    globalThis.fetch = async () => {
      attempts += 1;
      return {
        ok: false,
        status: 500,
        json: async () => ({
          error: {
            message: "temporary provider outage"
          }
        })
      };
    };

    const result = await execCommand({
      args: ["run", "fix metering ticket tally bug"],
      flags: { root: workingRoot, provider: "openai", model: "gpt-5.4" }
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "failed");
    assert.equal(result.error.code, "http_500");
    assert.equal(result.error.provider, "openai");
    assert.equal(result.error.status, 500);
    assert.equal(result.error.retryable, true);
    assert.equal(result.retry.attemptCount, 3);
    assert.equal(result.retry.exhausted, true);
    assert.equal(result.retry.attempts.length, 3);
    assert.equal(result.retry.attempts[0].provider, "openai");
    assert.equal(result.retry.attempts[0].statusCode, 500);
    assert.equal(attempts, 3);

    const [row] = querySql(
      runtime.paths.dbFile,
      "select output_json as outputJson, metrics_json as metricsJson from runs where command = 'exec_run' order by id desc limit 1;"
    );
    const output = JSON.parse(row.outputJson);
    const metrics = JSON.parse(row.metricsJson);
    assert.equal(output.error.code, "http_500");
    assert.equal(output.error.provider, "openai");
    assert.equal(output.retry.exhausted, true);
    assert.equal(metrics.attemptCount, 3);
    assert.equal(metrics.retryExhausted, true);
    assert.equal(metrics.finalErrorCode, "http_500");
    assert.equal(metrics.finalErrorRetryable, true);
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

test("exec handoff builds a logged manual Codex handoff artifact", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-exec-handoff-"));

  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const result = await execCommand({
      args: ["handoff", "fix metering ticket tally bug"],
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
        "Likely root cause: metering clamp is missing.",
        "",
        "```diff",
        "diff --git a/src/services/metering.js b/src/services/metering.js",
        "--- a/src/services/metering.js",
        "+++ b/src/services/metering.js",
        "@@ -1,6 +1,6 @@",
        " export function calculateTally(ticket, baseline) {",
        "   if (!ticket || ticket.stale) {",
        "     return 0;",
        "   }",
        " ",
        "-  return Math.min(baseline, ticket.ceiling || 0);",
        "+  return Math.min(baseline, ticket.ceiling);",
        " }",
        "```"
      ].join("\n")
    );

    const result = await execCommand({
      args: ["import", "fix metering ticket tally bug"],
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
