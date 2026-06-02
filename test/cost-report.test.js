import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { ensureAtlasRuntime } from "../src/core/runtime.js";
import { insertRun, updateRun, getCostReport } from "../src/core/store.js";

test("cost report aggregates recorded token usage with a per-model breakdown", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-cost-"));
  try {
    const runtime = await ensureAtlasRuntime(tempRoot);
    const dbFile = runtime.paths.dbFile;

    const recordRun = (model, provider, metrics) => {
      const run = insertRun(dbFile, { command: "exec_run", input: "task", metadata: { provider, model } });
      updateRun(dbFile, run.id, {
        status: "completed",
        output: { command: "exec run" },
        metrics: { provider, model, ...metrics }
      });
    };

    recordRun("gpt-5.4", "openai", { inputTokens: 100, outputTokens: 40, totalTokens: 140 });
    recordRun("gpt-5.4", "openai", { inputTokens: 50, outputTokens: 10, totalTokens: 60 });
    recordRun("claude", "anthropic", { inputTokens: 200, outputTokens: 20, totalTokens: 220 });

    const usage = getCostReport(dbFile).tokenUsage;

    assert.equal(usage.runsWithTokenData, 3);
    assert.equal(usage.totalTokens, 420);
    assert.equal(usage.inputTokens, 350);
    assert.equal(usage.outputTokens, 70);

    assert.equal(usage.byModel.length, 2);
    // Sorted by total tokens descending: claude (220) ahead of gpt-5.4 (200).
    assert.equal(usage.byModel[0].model, "claude");
    assert.equal(usage.byModel[0].totalTokens, 220);
    assert.equal(usage.byModel[0].runs, 1);

    const openai = usage.byModel.find((entry) => entry.model === "gpt-5.4");
    assert.equal(openai.runs, 2);
    assert.equal(openai.totalTokens, 200);
    assert.equal(openai.inputTokens, 150);
    assert.equal(openai.outputTokens, 50);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
