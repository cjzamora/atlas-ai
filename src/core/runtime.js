import fs from "node:fs/promises";
import path from "node:path";
import { initializeDatabase } from "./store.js";

export async function ensureAtlasRuntime(rootFlag) {
  const rootDir = path.resolve(rootFlag || process.cwd());
  const atlasDir = path.join(rootDir, ".atlas");
  const paths = {
    atlasDir,
    dbFile: path.join(atlasDir, "atlas.sqlite"),
    cacheDir: path.join(atlasDir, "cache"),
    summariesDir: path.join(atlasDir, "summaries"),
    runsDir: path.join(atlasDir, "runs"),
    memoryDir: path.join(atlasDir, "memory"),
    artifactsDir: path.join(atlasDir, "artifacts")
  };

  await fs.mkdir(paths.atlasDir, { recursive: true });
  await fs.mkdir(paths.cacheDir, { recursive: true });
  await fs.mkdir(paths.summariesDir, { recursive: true });
  await fs.mkdir(paths.runsDir, { recursive: true });
  await fs.mkdir(paths.memoryDir, { recursive: true });
  await fs.mkdir(paths.artifactsDir, { recursive: true });

  const configFile = path.join(paths.atlasDir, "config.json");
  try {
    await fs.access(configFile);
  } catch {
    await fs.writeFile(
      configFile,
      JSON.stringify(
        {
          version: 1,
          createdAt: new Date().toISOString(),
          rootDir,
          model: { provider: "openai", model: "gpt-5.4" },
          embeddings: { enabled: false, provider: "local" }
        },
        null,
        2
      )
    );
  }

  let config = {};
  try {
    config = JSON.parse(await fs.readFile(configFile, "utf8"));
  } catch {
    config = {};
  }

  initializeDatabase(paths.dbFile);

  return { rootDir, paths: { ...paths, configFile }, config };
}
