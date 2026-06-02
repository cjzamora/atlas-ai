import { ensureAtlasRuntime } from "../core/runtime.js";
import { searchMemory } from "../core/store.js";

export async function memorySearchCommand({ args, flags }) {
  const subcommand = args[0];
  if (subcommand !== "search") {
    throw new Error('Usage: atlas memory search "<query>"');
  }

  const query = args.slice(1).join(" ").trim();
  if (!query) {
    throw new Error('Usage: atlas memory search "<query>"');
  }

  const runtime = await ensureAtlasRuntime(flags.root);
  const limit = Number(flags.limit || 5);
  const matches = searchMemory(runtime.paths.dbFile, query, limit);

  return {
    ok: true,
    command: "memory search",
    query,
    count: matches.length,
    matches
  };
}
