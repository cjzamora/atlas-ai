import { ensureAtlasRuntime } from "../core/runtime.js";
import { getCostReport } from "../core/store.js";

export async function costReportCommand({ args, flags }) {
  const subcommand = args[0];
  if (subcommand && subcommand !== "report") {
    throw new Error("Usage: atlas cost report");
  }

  const runtime = await ensureAtlasRuntime(flags.root);
  const report = getCostReport(runtime.paths.dbFile);

  return {
    ok: true,
    command: "cost report",
    report
  };
}
