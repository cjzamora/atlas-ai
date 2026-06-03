// Reciprocal Rank Fusion (RRF) over a LIST of named ranked lists, so additional
// retrieval signals can be added later by appending to the list (seam #4 in the
// hybrid-retrieval design) rather than rewriting the fusion.
//
// Each entry: { name: string, ranked: string[] } where `ranked` is item ids in
// rank order (best first). Returns [{ id, score, sources: { name: rank } }] sorted
// by fused score descending, id ascending for stable ties.
const DEFAULT_K = 60;

export function fuseRankings(namedRankedLists, options = {}) {
  const k = Number(options.k || DEFAULT_K);
  const scores = new Map();

  for (const list of namedRankedLists || []) {
    const ranked = list?.ranked || [];
    for (let index = 0; index < ranked.length; index += 1) {
      const id = ranked[index];
      if (!id) {
        continue;
      }
      const rank = index + 1;
      const entry = scores.get(id) || { id, score: 0, sources: {} };
      entry.score += 1 / (k + rank);
      entry.sources[list.name] = rank;
      scores.set(id, entry);
    }
  }

  const fused = [...scores.values()].sort(
    (left, right) => right.score - left.score || left.id.localeCompare(right.id)
  );

  return Number.isFinite(options.limit) ? fused.slice(0, Math.max(0, options.limit)) : fused;
}
