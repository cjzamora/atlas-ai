import { querySql } from "./sqlite.js";

// Vectors are persisted as JSON-array TEXT in the `embeddings` table (the sqlite
// layer shells out to the sqlite3 CLI with string SQL, so JSON text is simpler and
// safer than binary blobs). Search is brute-force cosine in JS behind the
// `vectorSearch` boundary (seam #3) so an ANN index can be swapped in later.

export function serializeVector(vector) {
  return JSON.stringify(Array.from(vector, (value) => Number(value)));
}

export function parseVector(text) {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function cosineSimilarity(a, b) {
  const length = Math.min(a.length, b.length);
  if (length === 0) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function vectorSearch(dbFile, queryVector, limit = 10) {
  if (!queryVector || queryVector.length === 0) {
    return [];
  }

  let rows;
  try {
    rows = querySql(dbFile, "select path, vector from embeddings where kind = 'file';");
  } catch {
    return [];
  }

  const scored = [];
  for (const row of rows) {
    const vector = parseVector(row.vector);
    if (vector.length === 0) {
      continue;
    }
    scored.push({ path: row.path, score: cosineSimilarity(queryVector, vector) });
  }

  return scored
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, Math.max(1, limit));
}
