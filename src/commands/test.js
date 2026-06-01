import { ensureAtlasRuntime } from "../core/runtime.js";
import { selectImpactedTests } from "../validation/test-selection.js";

export async function testCommand({ args, flags }) {
  const subcommand = args[0];
  if (subcommand !== "impacted") {
    throw new Error('Usage: atlas test impacted "<query>"');
  }

  const query = args.slice(1).join(" ").trim();
  if (!query) {
    throw new Error('Usage: atlas test impacted "<query>"');
  }

  const runtime = await ensureAtlasRuntime(flags.root);
  const limit = Number(flags.limit || 10);
  const result = selectImpactedTests(runtime.paths.dbFile, query, limit);

  return {
    ok: true,
    command: "test impacted",
    query,
    impactedFiles: result.impactedFiles,
    tests: result.tests,
    message: result.impactedFiles.length === 0
      ? "No indexed impacted files found. Run `atlas index` for this repo first or broaden the query."
      : undefined
  };
}
