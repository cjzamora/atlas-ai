import { ensureAtlasRuntime } from "../core/runtime.js";
import { listRuns } from "../core/store.js";

export async function runsCommand({ flags }) {
  const runtime = await ensureAtlasRuntime(flags.root);
  const runs = listRuns(runtime.paths.dbFile, {
    limit: Number(flags.limit || 10),
    command: flags.command || null,
    status: flags.status || null
  });

  return {
    ok: true,
    command: "runs",
    filters: {
      command: flags.command || null,
      status: flags.status || null
    },
    count: runs.length,
    runs
  };
}
