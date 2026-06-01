import { ensureAtlasRuntime } from "../core/runtime.js";
import { createRunLogger } from "../core/run-log.js";
import { searchEvidence } from "../core/retrieval.js";

export async function askCommand({ args, flags }) {
  const query = args.join(" ").trim();
  if (!query) {
    throw new Error('Usage: atlas ask "<question>"');
  }

  const runtime = await ensureAtlasRuntime(flags.root);
  const limit = Number(flags.limit || 5);
  const evidence = searchEvidence(runtime.paths.dbFile, query, limit);

  const logger = createRunLogger(runtime.paths.dbFile);
  const run = logger.startRun({
    command: "ask",
    input: query,
    metadata: { limit }
  });

  logger.finishRun(run.id, {
    status: "completed",
    output: evidence,
    metrics: {
      evidenceCount: evidence.matches.length
    }
  });

  return {
    ok: true,
    command: "ask",
    query,
    answer: buildAnswer(query, evidence.matches),
    evidence: evidence.matches
  };
}

function buildAnswer(query, matches) {
  if (matches.length === 0) {
    return `No indexed evidence found for "${query}". Run \`atlas index\` first or broaden the query.`;
  }

  const first = matches[0];
  return `Best lead for "${query}" is ${first.path}${first.symbol ? ` via ${first.symbol}` : ""}.`;
}
