import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { executeSql, querySql } from "../src/core/sqlite.js";

// Regression: the sqlite3 CLI is shelled out via spawnSync, whose default stdout
// cap is 1 MB. Vector rows (embeddings stored as JSON text) push real-repo result
// sets well past that, which previously made reads throw and vector search silently
// return nothing. executeSql must read result sets larger than 1 MB intact.
test("querySql reads a result set larger than the default 1 MB spawn buffer", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-sqlite-"));
  try {
    const dbFile = path.join(tempRoot, "big.sqlite");
    // ~3 MB of text in a single row — comfortably over the old 1 MB stdout cap.
    const big = "x".repeat(3 * 1024 * 1024);
    executeSql(dbFile, "create table t(v text);");
    executeSql(dbFile, `insert into t(v) values('${big}');`);

    const rows = querySql(dbFile, "select v from t;");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].v.length, big.length, "the full >1 MB value must round-trip");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
