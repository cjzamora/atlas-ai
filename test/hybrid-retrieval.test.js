import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { ensureAtlasRuntime } from "../src/core/runtime.js";
import { scanRepository } from "../src/core/scanner.js";
import { upsertFiles } from "../src/core/store.js";
import { searchEvidence, hybridSearchEvidence } from "../src/core/retrieval.js";
import { buildEmbeddingIndex } from "../src/core/embedding-index.js";
import { stubEmbeddingAdapter } from "../src/adapters/embeddings/stub.js";
import { indexCommand } from "../src/commands/index.js";
import { querySql } from "../src/core/sqlite.js";
import { evaluateEvidenceAB } from "../src/core/retrieval-eval.js";

test("hybrid retrieval surfaces a concept-gap match that lexical alone misses", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-hybrid-"));
  try {
    const workingRoot = path.join(tempRoot, "repo");
    await fs.mkdir(path.join(workingRoot, "src"), { recursive: true });

    // This file is about authentication but never uses the word — only "guard"/"session".
    await fs.writeFile(
      path.join(workingRoot, "src", "access-control.js"),
      [
        "export function enforceSessionGuard(request) {",
        "  const session = request.session;",
        "  const guard = request.guard;",
        "  return Boolean(session && guard);",
        "}"
      ].join("\n")
    );
    // An unrelated distractor.
    await fs.writeFile(
      path.join(workingRoot, "src", "pricing-utils.js"),
      [
        "export function applyDiscount(total, rate) {",
        "  return total - total * rate;",
        "}"
      ].join("\n")
    );

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);
    const result = await buildEmbeddingIndex({
      dbFile: runtime.paths.dbFile,
      files: scan.files,
      adapter: stubEmbeddingAdapter
    });
    assert.ok(result.embedded >= 2, "both files should be embedded");

    // Lexical retrieval misses it: "authentication" appears nowhere in the file.
    const lexical = searchEvidence(runtime.paths.dbFile, "authentication", 5);
    assert.ok(!lexical.matches.some((match) => match.path === "src/access-control.js"));

    // Hybrid retrieval finds it via the semantic (vector) ranking.
    const hybrid = await hybridSearchEvidence(
      runtime.paths.dbFile,
      "authentication",
      5,
      stubEmbeddingAdapter
    );
    assert.equal(hybrid.mode, "hybrid");
    assert.ok(
      hybrid.matches.some((match) => match.path === "src/access-control.js"),
      "hybrid should surface the concept-gap file"
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("hybrid retrieval falls back to lexical when no adapter is given", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-hybrid-fallback-"));
  try {
    const workingRoot = path.join(tempRoot, "repo");
    await fs.mkdir(path.join(workingRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workingRoot, "src", "parser.js"),
      "export function tokenizeExpression(input) {\n  return input.split(' ');\n}"
    );

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const hybrid = await hybridSearchEvidence(runtime.paths.dbFile, "tokenize expression", 5, null);
    assert.equal(hybrid.mode, "lexical");
    assert.equal(hybrid.matches[0].path, "src/parser.js");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("atlas index builds the embedding index when enabled with an available adapter", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-index-embed-"));
  try {
    const workingRoot = path.join(tempRoot, "repo");
    await fs.mkdir(path.join(workingRoot, "src"), { recursive: true });
    await fs.mkdir(path.join(workingRoot, ".atlas"), { recursive: true });
    // Pre-seed config to enable embeddings via the (test-registered) stub provider.
    await fs.writeFile(
      path.join(workingRoot, ".atlas", "config.json"),
      JSON.stringify({ version: 1, embeddings: { enabled: true, provider: "stub" } }, null, 2)
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "widget.js"),
      "export function renderWidget() {\n  return 'widget';\n}"
    );

    const result = await indexCommand({ flags: { root: workingRoot } });
    assert.equal(result.embeddings.enabled, true);
    assert.equal(result.embeddings.available, true);
    assert.ok(result.embeddings.embedded >= 1);

    const rows = querySql(path.join(workingRoot, ".atlas", "atlas.sqlite"), "select count(*) as n from embeddings;");
    assert.ok(Number(rows[0].n) >= 1, "embeddings table should be populated");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("evidence A/B reports hybrid lift on a concept-gap query", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-ab-"));
  try {
    const workingRoot = path.join(tempRoot, "repo");
    await fs.mkdir(path.join(workingRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workingRoot, "src", "access-control.js"),
      [
        "export function enforceSessionGuard(request) {",
        "  const session = request.session;",
        "  const guard = request.guard;",
        "  return Boolean(session && guard);",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "pricing-utils.js"),
      "export function applyDiscount(total, rate) {\n  return total - total * rate;\n}"
    );

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);
    await buildEmbeddingIndex({ dbFile: runtime.paths.dbFile, files: scan.files, adapter: stubEmbeddingAdapter });

    const spec = {
      limit: 5,
      cases: [
        { id: "auth-concept", query: "authentication", expectedEvidence: ["src/access-control.js"], expectedTests: [] }
      ]
    };
    const ab = await evaluateEvidenceAB(runtime.paths.dbFile, spec, stubEmbeddingAdapter);

    assert.equal(ab.embedderActive, true);
    assert.equal(ab.lexical.evidenceHitRate, 0, "lexical should miss the concept-gap query");
    assert.equal(ab.hybrid.evidenceHitRate, 1, "hybrid should catch it");
    assert.ok(ab.lift.evidenceHitRate > 0, "A/B should report positive lift");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
