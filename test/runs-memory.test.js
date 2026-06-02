import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { ensureAtlasRuntime } from "../src/core/runtime.js";
import { insertRun, listRuns, searchMemory, updateRun } from "../src/core/store.js";
import { runsCommand } from "../src/commands/runs.js";
import { memorySearchCommand } from "../src/commands/memory-search.js";

test("listRuns filters by command and status and exposes outcome summaries", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-runs-"));
  try {
    const runtime = await ensureAtlasRuntime(tempRoot);

    const fixRun = insertRun(runtime.paths.dbFile, {
      command: "fix",
      input: "fix pricing fallback bug",
      metadata: {
        provider: "openai",
        model: "gpt-5.4",
        rollbackOnFail: false
      }
    });
    updateRun(runtime.paths.dbFile, fixRun.id, {
      status: "completed",
      output: {
        command: "fix",
        task: "fix pricing fallback bug",
        status: "confirmed",
        artifactId: "patch-confirmed",
        apply: {
          changedFiles: ["src/services/pricing.js"]
        }
      },
      metrics: {
        totalTokens: 30,
        selectedTests: 2,
        changedFiles: 1
      }
    });

    const execRun = insertRun(runtime.paths.dbFile, {
      command: "exec_run",
      input: "fix pricing fallback bug",
      metadata: {
        provider: "openai",
        model: "gpt-5.4"
      }
    });
    updateRun(runtime.paths.dbFile, execRun.id, {
      status: "failed",
      output: {
        command: "exec run",
        task: "fix pricing fallback bug",
        status: "failed",
        error: {
          code: "missing_api_key",
          message: "OPENAI_API_KEY is not set."
        }
      },
      metrics: {}
    });

    const runs = listRuns(runtime.paths.dbFile, {
      limit: 10,
      command: "fix",
      status: "completed"
    });

    assert.equal(runs.length, 1);
    assert.equal(runs[0].command, "fix");
    assert.equal(runs[0].status, "completed");
    assert.equal(runs[0].outcome, "confirmed");
    assert.equal(runs[0].task, "fix pricing fallback bug");
    assert.equal(runs[0].provider, "openai");
    assert.equal(runs[0].model, "gpt-5.4");
    assert.equal(runs[0].totalTokens, 30);
    assert.equal(runs[0].selectedTests, 2);
    assert.deepEqual(runs[0].changedFiles, ["src/services/pricing.js"]);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("searchMemory returns typed run outcomes for confirmed and rolled back fixes", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-memory-"));
  try {
    const runtime = await ensureAtlasRuntime(tempRoot);

    const confirmedRun = insertRun(runtime.paths.dbFile, {
      command: "fix",
      input: "fix pricing fallback bug",
      metadata: {
        provider: "openai",
        model: "gpt-5.4"
      }
    });
    updateRun(runtime.paths.dbFile, confirmedRun.id, {
      status: "completed",
      output: {
        command: "fix",
        task: "fix pricing fallback bug",
        status: "confirmed",
        artifactId: "patch-confirmed",
        apply: {
          changedFiles: ["src/services/pricing.js"]
        },
        stage: {
          request: {
            selectedTests: ["test/services/pricing.test.js"]
          }
        }
      },
      metrics: {
        totalTokens: 30,
        selectedTests: 1,
        changedFiles: 1
      }
    });

    const rolledBackRun = insertRun(runtime.paths.dbFile, {
      command: "fix",
      input: "fix pricing fallback bug",
      metadata: {
        provider: "openai",
        model: "gpt-5.4",
        rollbackOnFail: true
      }
    });
    updateRun(runtime.paths.dbFile, rolledBackRun.id, {
      status: "failed",
      output: {
        command: "fix",
        task: "fix pricing fallback bug",
        status: "rolled_back",
        artifactId: "patch-rolled-back",
        rollback: {
          changedFiles: ["src/services/pricing.js"]
        }
      },
      metrics: {
        totalTokens: 45,
        rolledBackFiles: 1
      }
    });

    const matches = searchMemory(runtime.paths.dbFile, "pricing fallback", 10);

    assert.equal(matches.length, 2);
    assert.equal(matches[0].type, "run_outcome");
    assert.ok(matches[0].tags.includes("command:fix"));
    assert.ok(matches.some((entry) => entry.tags.includes("outcome:confirmed")));
    assert.ok(matches.some((entry) => entry.tags.includes("outcome:rolled_back")));
    assert.ok(matches.some((entry) => /Confirmed fix/.test(entry.summary)));
    assert.ok(matches.some((entry) => /Rolled back fix/.test(entry.summary)));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("runs and memory commands expose filtered summaries", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-runs-command-"));
  try {
    const runtime = await ensureAtlasRuntime(tempRoot);

    const fixRun = insertRun(runtime.paths.dbFile, {
      command: "fix",
      input: "fix pricing fallback bug",
      metadata: {
        provider: "openai",
        model: "gpt-5.4"
      }
    });
    updateRun(runtime.paths.dbFile, fixRun.id, {
      status: "completed",
      output: {
        command: "fix",
        task: "fix pricing fallback bug",
        status: "confirmed",
        apply: {
          changedFiles: ["src/services/pricing.js"]
        },
        stage: {
          request: {
            selectedTests: ["test/services/pricing.test.js"]
          }
        }
      },
      metrics: {
        totalTokens: 30,
        selectedTests: 1,
        changedFiles: 1
      }
    });

    const runsResult = await runsCommand({
      flags: {
        root: tempRoot,
        command: "fix",
        status: "completed",
        limit: 5
      }
    });
    assert.equal(runsResult.count, 1);
    assert.equal(runsResult.runs[0].outcome, "confirmed");

    const memoryResult = await memorySearchCommand({
      args: ["search", "pricing", "fallback"],
      flags: {
        root: tempRoot,
        limit: 5
      }
    });
    assert.equal(memoryResult.count, 1);
    assert.equal(memoryResult.matches[0].type, "run_outcome");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
