import test from "node:test";
import assert from "node:assert/strict";
import { fuseRankings } from "../src/core/rank-fusion.js";
import { cosineSimilarity, serializeVector, parseVector } from "../src/core/vector-store.js";

test("fuseRankings rewards items ranked highly across multiple lists", () => {
  const fused = fuseRankings([
    { name: "lexical", ranked: ["a", "b", "c"] },
    { name: "vector", ranked: ["b", "a", "d"] }
  ]);

  // 'b' is rank 2 + rank 1, 'a' is rank 1 + rank 2 — tie on score, 'a' wins on id.
  assert.equal(fused[0].id, "a");
  assert.equal(fused[1].id, "b");
  assert.deepEqual(fused[0].sources, { lexical: 1, vector: 2 });
  assert.ok(fused.find((e) => e.id === "c"));
  assert.ok(fused.find((e) => e.id === "d"));
});

test("fuseRankings lets agreement beat a single strong list", () => {
  // 'x' is only #1 in one list; 'y' is #2 in both — consensus should win.
  const fused = fuseRankings([
    { name: "lexical", ranked: ["x", "y"] },
    { name: "vector", ranked: ["z", "y"] }
  ]);
  assert.equal(fused[0].id, "y");
});

test("fuseRankings respects the limit option", () => {
  const fused = fuseRankings([{ name: "only", ranked: ["a", "b", "c", "d"] }], { limit: 2 });
  assert.equal(fused.length, 2);
});

test("cosineSimilarity is 1 for identical vectors and 0 for orthogonal", () => {
  assert.equal(Math.round(cosineSimilarity([1, 2, 3], [1, 2, 3]) * 1000) / 1000, 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
});

test("serializeVector/parseVector round-trips float values", () => {
  const original = Float32Array.from([0.1, -0.5, 0.25]);
  const restored = parseVector(serializeVector(original));
  assert.equal(restored.length, 3);
  assert.ok(Math.abs(restored[1] + 0.5) < 1e-6);
});
