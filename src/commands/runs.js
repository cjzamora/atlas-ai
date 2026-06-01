import { ensureAtlasRuntime } from "../core/runtime.js";
import { listRuns } from "../core/store.js";

export async function runsCommand({ flags }) {
  const runtime = await ensureAtlasRuntime(flags.root);
  const limit = Number(flags.limit || 10);
  const runs = listRuns(runtime.paths.dbFile, limit);

  return {
    ok: true,
    command: "runs",
    count: runs.length,
    runs
  };
}
