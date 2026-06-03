import fs from "node:fs/promises";
import crypto from "node:crypto";
import { executeSql, querySql } from "./sqlite.js";
import { serializeVector } from "./vector-store.js";

// Per-file embedding index (chunk-keyed by path with kind='file' for v1; seam #2
// keeps per-symbol additions migration-free). Builds a synthesized doc per file
// (path + symbol names + a content excerpt), embeds via the adapter, and upserts
// only files whose doc/model changed (incremental via content_sha1).
const MAX_DOC_CHARS = 1200;
const BATCH_SIZE = 32;

export async function buildEmbeddingIndex({ dbFile, files, adapter }) {
  if (!adapter) {
    return { embedded: 0, reused: 0, total: files.length, model: null };
  }
  const model = String(adapter.model || adapter.id || "unknown");

  const existing = new Map();
  try {
    const rows = querySql(
      dbFile,
      "select path, content_sha1 as sha, model from embeddings where kind = 'file';"
    );
    for (const row of rows) {
      existing.set(row.path, { sha: row.sha, model: row.model });
    }
  } catch {
    // table empty/unavailable; treat as nothing indexed yet
  }

  const pending = [];
  let reused = 0;
  for (const file of files) {
    const doc = await buildDoc(file);
    const sha = crypto.createHash("sha1").update(`${model}:${doc}`).digest("hex");
    const prev = existing.get(file.path);
    if (prev && prev.sha === sha && prev.model === model) {
      reused += 1;
      continue;
    }
    pending.push({ path: file.path, doc, sha });
  }

  let embedded = 0;
  for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
    const batch = pending.slice(offset, offset + BATCH_SIZE);
    let vectors;
    try {
      vectors = await adapter.embed(batch.map((entry) => entry.doc));
    } catch {
      continue; // skip this batch on embed failure; files stay lexically searchable
    }
    const values = batch
      .map((entry, index) => {
        const vector = vectors[index] || [];
        if (vector.length === 0) {
          return null;
        }
        return `('${esc(entry.path)}', '${esc(entry.path)}', 'file', NULL, '${esc(model)}', ${vector.length}, '${esc(serializeVector(vector))}', '${esc(entry.sha)}')`;
      })
      .filter(Boolean);
    if (values.length > 0) {
      executeSql(
        dbFile,
        `insert or replace into embeddings(chunk_id, path, kind, ref, model, dim, vector, content_sha1) values ${values.join(", ")};`
      );
      embedded += values.length;
    }
  }

  // Drop embeddings for files no longer in the repo.
  const keep = files.length > 0 ? files.map((file) => `'${esc(file.path)}'`).join(", ") : "''";
  executeSql(dbFile, `delete from embeddings where path not in (${keep});`);

  return { embedded, reused, total: files.length, model };
}

async function buildDoc(file) {
  const symbolNames = (file.symbols || []).map((symbol) => symbol.name).join(" ");
  let content = "";
  try {
    content = await fs.readFile(file.absolutePath, "utf8");
  } catch {
    content = file.summary || "";
  }
  return `${file.path}\n${symbolNames}\n${content}`.slice(0, MAX_DOC_CHARS);
}

function esc(value) {
  return String(value).replace(/'/g, "''");
}
