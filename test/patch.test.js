import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { ensureAtlasRuntime } from "../src/core/runtime.js";
import { scanRepository } from "../src/core/scanner.js";
import { insertRun, updateRun, upsertFiles } from "../src/core/store.js";
import { parsePatchResponse } from "../src/core/patch-artifact.js";
import { patchCommand } from "../src/commands/patch.js";

const fixtureRoot = path.resolve("test/fixtures/sample-repo");

test("parsePatchResponse extracts fenced diffs and preserves raw output", () => {
  const rawOutput = [
    "Here is the change:",
    "",
    "```diff",
    "diff --git a/src/services/metering.js b/src/services/metering.js",
    "--- a/src/services/metering.js",
    "+++ b/src/services/metering.js",
    "@@ -1,3 +1,3 @@",
    "-const tally = ticket.value;",
    "+const tally = Math.min(ticket.value, baseline);",
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
  const rawOutput = "I would update metering validation, but no patch is included.";
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
          "diff --git a/src/services/metering.js b/src/services/metering.js",
          "--- a/src/services/metering.js",
          "+++ b/src/services/metering.js",
          "@@ -1,3 +1,3 @@",
          "-const total = baseline - tally;",
          "+const total = Math.max(0, baseline - tally);",
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
      args: ["stage", "fix metering tally underflow"],
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

test("patch stage persists matched memory hints and assistance metadata on the artifact", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-patch-stage-memory-"));
  const previousApiKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;

  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const priorRun = insertRun(runtime.paths.dbFile, {
      command: "fix",
      input: "fix metering fallback bug",
      metadata: {
        provider: "openai",
        model: "gpt-5.4"
      }
    });
    updateRun(runtime.paths.dbFile, priorRun.id, {
      status: "completed",
      output: {
        command: "fix",
        task: "fix metering fallback bug",
        status: "confirmed",
        apply: {
          changedFiles: ["src/services/metering.js"]
        },
        stage: {
          request: {
            selectedTests: ["test/services/metering.test.js"]
          }
        }
      },
      metrics: {
        totalTokens: 30,
        selectedTests: 1,
        changedFiles: 1
      }
    });

    process.env.OPENAI_API_KEY = "test-key";
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: "resp_patch_memory",
        status: "completed",
        output_text: [
          "```diff",
          "diff --git a/src/services/metering.js b/src/services/metering.js",
          "--- a/src/services/metering.js",
          "+++ b/src/services/metering.js",
          "@@ -1,3 +1,3 @@",
          "-const total = baseline - tally;",
          "+const total = Math.max(0, baseline - tally);",
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
      args: ["stage", "fix fallback regression"],
      flags: { root: workingRoot, provider: "openai", model: "gpt-5.4", limit: 5 }
    });

    assert.equal(staged.artifact.memoryHints.length, 1);
    assert.equal(staged.artifact.memoryAssistance.matchedPatternCount, 1);
    assert.equal(staged.artifact.memoryAssistance.retrievalBoostApplied, true);
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

test("patch stage retries transient provider failures and succeeds on a later attempt", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-patch-stage-retry-"));
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
        return {
          ok: false,
          status: 429,
          json: async () => ({
            error: {
              code: "rate_limit_exceeded",
              message: "try again"
            }
          })
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "resp_patch_retry",
          status: "completed",
          output_text: [
            "```diff",
            "diff --git a/src/services/metering.js b/src/services/metering.js",
            "--- a/src/services/metering.js",
            "+++ b/src/services/metering.js",
            "@@ -1,3 +1,3 @@",
            "-const total = baseline - tally;",
            "+const total = Math.max(0, baseline - tally);",
            "```"
          ].join("\n"),
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            total_tokens: 30
          }
        })
      };
    };

    const staged = await patchCommand({
      args: ["stage", "fix metering tally underflow"],
      flags: { root: workingRoot, provider: "openai", model: "gpt-5.4", limit: 5 }
    });

    assert.equal(staged.ok, true);
    assert.equal(staged.status, "staged");
    assert.equal(staged.retry.attemptCount, 2);
    assert.equal(staged.retry.retried, true);
    assert.equal(attempts, 2);
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

test("patch apply writes validated unified diffs to disk and marks the artifact as applied", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-patch-apply-"));

  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const artifact = {
      id: "patch-validated-apply",
      type: "patch",
      reviewOnly: true,
      task: "apply metering tally clamp",
      status: "validated",
      createdAt: new Date().toISOString(),
      parseStatus: "parsed",
      patches: [
        {
          kind: "diff",
          language: "diff",
          diff: [
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
            " }"
          ].join("\n")
        }
      ],
      rawOutput: "",
      selectedTests: ["test/services/metering.test.js"],
      files: [],
      validation: {
        status: "passed",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
        results: []
      }
    };

    await fs.writeFile(
      path.join(runtime.paths.artifactsDir, `${artifact.id}.json`),
      `${JSON.stringify(artifact, null, 2)}\n`
    );

    const applied = await patchCommand({
      args: ["apply", artifact.id],
      flags: { root: workingRoot }
    });

    assert.equal(applied.ok, true);
    assert.equal(applied.command, "patch apply");
    assert.equal(applied.status, "applied");
    assert.deepEqual(applied.changedFiles, ["src/services/metering.js"]);

    const updatedSource = await fs.readFile(path.join(workingRoot, "src/services/metering.js"), "utf8");
    assert.match(updatedSource, /Math\.min\(baseline, ticket\.ceiling\)/);

    const stored = JSON.parse(
      await fs.readFile(path.join(runtime.paths.artifactsDir, `${artifact.id}.json`), "utf8")
    );
    assert.equal(stored.status, "applied");
    assert.deepEqual(stored.appliedFiles, ["src/services/metering.js"]);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("patch apply rejects artifacts that have not passed validation", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-patch-apply-reject-"));

  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const artifact = {
      id: "patch-unvalidated-apply",
      type: "patch",
      reviewOnly: true,
      task: "reject unvalidated apply",
      status: "staged",
      createdAt: new Date().toISOString(),
      parseStatus: "parsed",
      patches: [
        {
          kind: "diff",
          language: "diff",
          diff: [
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
            " }"
          ].join("\n")
        }
      ],
      rawOutput: "",
      selectedTests: ["test/services/metering.test.js"],
      files: [],
      validation: null
    };

    await fs.writeFile(
      path.join(runtime.paths.artifactsDir, `${artifact.id}.json`),
      `${JSON.stringify(artifact, null, 2)}\n`
    );

    await assert.rejects(
      () => patchCommand({
        args: ["apply", artifact.id],
        flags: { root: workingRoot }
      }),
      /must pass validation before apply/i
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("patch confirm reruns selected tests after apply and marks the artifact as confirmed", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-patch-confirm-"));

  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const artifact = {
      id: "patch-confirmed-apply",
      type: "patch",
      reviewOnly: true,
      task: "confirm applied metering patch",
      status: "applied",
      createdAt: new Date().toISOString(),
      parseStatus: "parsed",
      patches: [],
      rawOutput: "",
      selectedTests: [
        "test/services/metering.test.js",
        "test/services/intake.test.js"
      ],
      files: [],
      validation: {
        status: "passed",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        summary: { total: 2, passed: 2, failed: 0, skipped: 0 },
        results: []
      },
      appliedAt: new Date().toISOString(),
      appliedFiles: ["src/services/metering.js"]
    };

    await fs.writeFile(
      path.join(runtime.paths.artifactsDir, `${artifact.id}.json`),
      `${JSON.stringify(artifact, null, 2)}\n`
    );

    const confirmed = await patchCommand({
      args: ["confirm", artifact.id],
      flags: { root: workingRoot }
    });

    assert.equal(confirmed.ok, true);
    assert.equal(confirmed.command, "patch confirm");
    assert.equal(confirmed.status, "confirmed");
    assert.equal(confirmed.postApplyValidation.status, "passed");
    assert.equal(confirmed.postApplyValidation.summary.passed, 2);

    const stored = JSON.parse(
      await fs.readFile(path.join(runtime.paths.artifactsDir, `${artifact.id}.json`), "utf8")
    );
    assert.equal(stored.status, "confirmed");
    assert.equal(stored.postApplyValidation.status, "passed");
    assert.ok(stored.confirmedAt);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("patch confirm marks the artifact when post-apply validation fails", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-patch-confirm-fail-"));

  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    await fs.writeFile(
      path.join(workingRoot, "test/services/metering.test.js"),
      [
        "export function meteringTestCase() {",
        "  throw new Error('metering regression');",
        "}"
      ].join("\n")
    );

    const runtime = await ensureAtlasRuntime(workingRoot);
    const artifact = {
      id: "patch-confirm-failed-validation",
      type: "patch",
      reviewOnly: true,
      task: "flag failed post-apply validation",
      status: "applied",
      createdAt: new Date().toISOString(),
      parseStatus: "parsed",
      patches: [],
      rawOutput: "",
      selectedTests: ["test/services/metering.test.js"],
      files: [],
      validation: {
        status: "passed",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
        results: []
      },
      appliedAt: new Date().toISOString(),
      appliedFiles: ["src/services/metering.js"]
    };

    await fs.writeFile(
      path.join(runtime.paths.artifactsDir, `${artifact.id}.json`),
      `${JSON.stringify(artifact, null, 2)}\n`
    );

    const confirmed = await patchCommand({
      args: ["confirm", artifact.id],
      flags: { root: workingRoot }
    });

    assert.equal(confirmed.ok, true);
    assert.equal(confirmed.command, "patch confirm");
    assert.equal(confirmed.status, "apply_failed_validation");
    assert.equal(confirmed.postApplyValidation.status, "failed");
    assert.equal(confirmed.postApplyValidation.summary.failed, 1);
    assert.equal(confirmed.postApplyValidation.failureReason, "metering regression");
    assert.equal(confirmed.failureReason, "metering regression");

    const stored = JSON.parse(
      await fs.readFile(path.join(runtime.paths.artifactsDir, `${artifact.id}.json`), "utf8")
    );
    assert.equal(stored.status, "apply_failed_validation");
    assert.equal(stored.postApplyValidation.status, "failed");
    assert.equal(stored.postApplyValidation.failureReason, "metering regression");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("patch apply stores file snapshots that patch rollback can restore", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-patch-rollback-"));

  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const originalSource = await fs.readFile(path.join(workingRoot, "src/services/metering.js"), "utf8");
    const artifact = {
      id: "patch-rollback-success",
      type: "patch",
      reviewOnly: true,
      task: "rollback metering patch",
      status: "validated",
      createdAt: new Date().toISOString(),
      parseStatus: "parsed",
      patches: [
        {
          kind: "diff",
          language: "diff",
          diff: [
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
            " }"
          ].join("\n")
        }
      ],
      rawOutput: "",
      selectedTests: ["test/services/metering.test.js"],
      files: [],
      validation: {
        status: "passed",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
        results: []
      },
      postApplyValidation: null,
      appliedAt: null,
      appliedFiles: [],
      confirmedAt: null
    };

    await fs.writeFile(
      path.join(runtime.paths.artifactsDir, `${artifact.id}.json`),
      `${JSON.stringify(artifact, null, 2)}\n`
    );

    const applied = await patchCommand({
      args: ["apply", artifact.id],
      flags: { root: workingRoot }
    });

    assert.equal(applied.status, "applied");
    assert.equal(applied.artifact.fileSnapshots.length, 1);
    assert.equal(applied.artifact.fileSnapshots[0].path, "src/services/metering.js");
    assert.equal(applied.artifact.fileSnapshots[0].before, originalSource);

    const rolledBack = await patchCommand({
      args: ["rollback", artifact.id],
      flags: { root: workingRoot }
    });

    assert.equal(rolledBack.ok, true);
    assert.equal(rolledBack.command, "patch rollback");
    assert.equal(rolledBack.status, "rolled_back");
    assert.deepEqual(rolledBack.changedFiles, ["src/services/metering.js"]);

    const restoredSource = await fs.readFile(path.join(workingRoot, "src/services/metering.js"), "utf8");
    assert.equal(restoredSource, originalSource);

    const stored = JSON.parse(
      await fs.readFile(path.join(runtime.paths.artifactsDir, `${artifact.id}.json`), "utf8")
    );
    assert.equal(stored.status, "rolled_back");
    assert.ok(stored.rolledBackAt);
    assert.deepEqual(stored.rolledBackFiles, ["src/services/metering.js"]);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("patch rollback rejects artifacts that were never applied", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-patch-rollback-reject-"));

  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const artifact = {
      id: "patch-rollback-reject",
      type: "patch",
      reviewOnly: true,
      task: "reject rollback",
      status: "validated",
      createdAt: new Date().toISOString(),
      parseStatus: "parsed",
      patches: [],
      rawOutput: "",
      selectedTests: [],
      files: [],
      validation: {
        status: "passed",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
        results: []
      },
      postApplyValidation: null,
      appliedAt: null,
      appliedFiles: [],
      confirmedAt: null
    };

    await fs.writeFile(
      path.join(runtime.paths.artifactsDir, `${artifact.id}.json`),
      `${JSON.stringify(artifact, null, 2)}\n`
    );

    await assert.rejects(
      () => patchCommand({
        args: ["rollback", artifact.id],
        flags: { root: workingRoot }
      }),
      /must be applied or failed validation before rollback/i
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("patch apply --confirm applies the patch and marks the artifact confirmed when post-apply validation passes", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-patch-apply-confirm-"));

  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const artifact = {
      id: "patch-apply-confirm-success",
      type: "patch",
      reviewOnly: true,
      task: "apply and confirm metering patch",
      status: "validated",
      createdAt: new Date().toISOString(),
      parseStatus: "parsed",
      patches: [
        {
          kind: "diff",
          language: "diff",
          diff: [
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
            " }"
          ].join("\n")
        }
      ],
      rawOutput: "",
      selectedTests: ["test/services/metering.test.js"],
      files: [],
      validation: {
        status: "passed",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
        results: []
      },
      postApplyValidation: null,
      appliedAt: null,
      appliedFiles: [],
      confirmedAt: null,
      fileSnapshots: [],
      rolledBackAt: null,
      rolledBackFiles: []
    };

    await fs.writeFile(
      path.join(runtime.paths.artifactsDir, `${artifact.id}.json`),
      `${JSON.stringify(artifact, null, 2)}\n`
    );

    const result = await patchCommand({
      args: ["apply", artifact.id],
      flags: { root: workingRoot, confirm: true }
    });

    assert.equal(result.ok, true);
    assert.equal(result.command, "patch apply");
    assert.equal(result.status, "confirmed");
    assert.equal(result.postApplyValidation.status, "passed");

    const stored = JSON.parse(
      await fs.readFile(path.join(runtime.paths.artifactsDir, `${artifact.id}.json`), "utf8")
    );
    assert.equal(stored.status, "confirmed");
    assert.equal(stored.postApplyValidation.status, "passed");
    assert.ok(stored.appliedAt);
    assert.ok(stored.confirmedAt);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("patch apply --confirm returns a failed-validation status when confirmation fails", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-patch-apply-confirm-fail-"));

  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    await fs.writeFile(
      path.join(workingRoot, "test/services/metering.test.js"),
      [
        "export function meteringTestCase() {",
        "  throw new Error('metering regression');",
        "}"
      ].join("\n")
    );

    const runtime = await ensureAtlasRuntime(workingRoot);
    const artifact = {
      id: "patch-apply-confirm-fail",
      type: "patch",
      reviewOnly: true,
      task: "apply and fail confirmation",
      status: "validated",
      createdAt: new Date().toISOString(),
      parseStatus: "parsed",
      patches: [
        {
          kind: "diff",
          language: "diff",
          diff: [
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
            " }"
          ].join("\n")
        }
      ],
      rawOutput: "",
      selectedTests: ["test/services/metering.test.js"],
      files: [],
      validation: {
        status: "passed",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
        results: []
      },
      postApplyValidation: null,
      appliedAt: null,
      appliedFiles: [],
      confirmedAt: null,
      fileSnapshots: [],
      rolledBackAt: null,
      rolledBackFiles: []
    };

    await fs.writeFile(
      path.join(runtime.paths.artifactsDir, `${artifact.id}.json`),
      `${JSON.stringify(artifact, null, 2)}\n`
    );

    const result = await patchCommand({
      args: ["apply", artifact.id],
      flags: { root: workingRoot, confirm: true }
    });

    assert.equal(result.ok, true);
    assert.equal(result.command, "patch apply");
    assert.equal(result.status, "apply_failed_validation");
    assert.equal(result.postApplyValidation.status, "failed");

    const stored = JSON.parse(
      await fs.readFile(path.join(runtime.paths.artifactsDir, `${artifact.id}.json`), "utf8")
    );
    assert.equal(stored.status, "apply_failed_validation");
    assert.equal(stored.postApplyValidation.status, "failed");
    assert.ok(stored.appliedAt);
    assert.equal(stored.confirmedAt, null);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
