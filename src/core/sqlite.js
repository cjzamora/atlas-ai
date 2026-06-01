import { spawnSync } from "node:child_process";

export function executeSql(dbFile, sql) {
  const result = spawnSync("sqlite3", [dbFile], {
    input: `.timeout 5000\n${sql}`,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "sqlite3 command failed");
  }

  return result.stdout.trim();
}

export function querySql(dbFile, sql) {
  const wrapped = `.mode json\n${sql}`;
  const output = executeSql(dbFile, wrapped);
  if (!output) {
    return [];
  }

  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed : [parsed];
}
