import { ensureAtlasRuntime } from "../core/runtime.js";

export async function initCommand({ flags }) {
  const runtime = await ensureAtlasRuntime(flags.root);
  return {
    ok: true,
    command: "init",
    root: runtime.rootDir,
    runtime: runtime.paths,
    message: "Atlas runtime initialized."
  };
}
