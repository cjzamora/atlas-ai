import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { ensureAtlasRuntime } from "../src/core/runtime.js";
import { scanRepository } from "../src/core/scanner.js";
import { upsertFiles } from "../src/core/store.js";
import { evalCommand } from "../src/commands/eval.js";

const fixtureRoot = path.resolve("test/fixtures/sample-repo");

test("eval retrieval reports hit metrics for evidence and impacted tests from a spec file", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-eval-retrieval-"));

  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const specFile = path.join(tempRoot, "retrieval-spec.json");
    await fs.writeFile(
      specFile,
      JSON.stringify({
        limit: 5,
        cases: [
          {
            query: "pricing coupon discount",
            expectedEvidence: ["src/services/pricing.js"],
            expectedTests: ["test/services/pricing.test.js"]
          },
          {
            query: "checkout apply coupon",
            expectedEvidence: ["src/services/checkout.js"],
            expectedTests: ["test/services/checkout.test.js"]
          }
        ]
      }, null, 2)
    );

    const result = await evalCommand({
      args: ["retrieval"],
      flags: { root: workingRoot, spec: specFile }
    });

    assert.equal(result.ok, true);
    assert.equal(result.command, "eval retrieval");
    assert.equal(result.summary.caseCount, 2);
    assert.equal(result.summary.evidenceHitRate, 1);
    assert.equal(result.summary.testHitRate, 1);
    assert.equal(result.cases[0].evidence.hit, true);
    assert.equal(result.cases[0].tests.hit, true);
    assert.ok(result.cases[0].evidence.topMatches.includes("src/services/pricing.js"));
    assert.ok(result.cases[0].evidence.rank >= 1);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("eval retrieval surfaces misses when expected files are not retrieved", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-eval-retrieval-miss-"));

  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const specFile = path.join(tempRoot, "retrieval-miss-spec.json");
    await fs.writeFile(
      specFile,
      JSON.stringify({
        limit: 3,
        cases: [
          {
            query: "pricing coupon discount",
            expectedEvidence: ["src/controllers/does-not-exist.js"],
            expectedTests: ["test/services/does-not-exist.test.js"]
          }
        ]
      }, null, 2)
    );

    const result = await evalCommand({
      args: ["retrieval"],
      flags: { root: workingRoot, spec: specFile }
    });

    assert.equal(result.ok, true);
    assert.equal(result.summary.caseCount, 1);
    assert.equal(result.summary.evidenceHitRate, 0);
    assert.equal(result.summary.testHitRate, 0);
    assert.equal(result.cases[0].evidence.hit, false);
    assert.equal(result.cases[0].tests.hit, false);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
