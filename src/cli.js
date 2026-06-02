#!/usr/bin/env node

import { initCommand } from "./commands/init.js";
import { indexCommand } from "./commands/index.js";
import { askCommand } from "./commands/ask.js";
import { planCommand } from "./commands/plan.js";
import { contextCommand } from "./commands/context.js";
import { promptCommand } from "./commands/prompt.js";
import { execCommand } from "./commands/exec.js";
import { patchCommand } from "./commands/patch.js";
import { runsCommand } from "./commands/runs.js";
import { memorySearchCommand } from "./commands/memory-search.js";
import { costReportCommand } from "./commands/cost-report.js";
import { testCommand } from "./commands/test.js";
import { formatOutput } from "./core/output.js";

const commandHandlers = {
  init: initCommand,
  index: indexCommand,
  ask: askCommand,
  plan: planCommand,
  context: contextCommand,
  prompt: promptCommand,
  exec: execCommand,
  patch: patchCommand,
  runs: runsCommand,
  memory: memorySearchCommand,
  cost: costReportCommand,
  test: testCommand
};

function parseArgv(argv) {
  const positionals = [];
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }

    const flag = value.slice(2);
    const nextValue = argv[index + 1];
    if (!nextValue || nextValue.startsWith("--")) {
      flags[flag] = true;
      continue;
    }

    flags[flag] = nextValue;
    index += 1;
  }

  return { positionals, flags };
}

function usage() {
  return [
    "Atlas v0",
    "",
    "Usage:",
    "  atlas init [--root <path>]",
    "  atlas index [--root <path>] [--json]",
    "  atlas ask \"<question>\" [--root <path>] [--limit <n>] [--json]",
    "  atlas plan \"<task>\" [--root <path>] [--limit <n>] [--json]",
    "  atlas context \"<task>\" [--root <path>] [--limit <n>] [--json]",
    "  atlas prompt \"<task>\" [--root <path>] [--limit <n>] [--json]",
    "  atlas exec prepare \"<task>\" [--root <path>] [--limit <n>] [--provider <name>] [--model <name>] [--json]",
    "  atlas exec run \"<task>\" [--root <path>] [--limit <n>] [--provider <name>] [--model <name>] [--json]",
    "  atlas patch stage \"<task>\" [--root <path>] [--limit <n>] [--provider <name>] [--model <name>] [--json]",
    "  atlas patch show <artifact-id> [--root <path>] [--json]",
    "  atlas patch apply <artifact-id> [--root <path>] [--confirm] [--json]",
    "  atlas patch confirm <artifact-id> [--root <path>] [--json]",
    "  atlas patch rollback <artifact-id> [--root <path>] [--json]",
    "  atlas runs [--root <path>] [--limit <n>] [--json]",
    "  atlas memory search \"<query>\" [--root <path>] [--limit <n>] [--json]",
    "  atlas cost report [--root <path>] [--json]",
    "  atlas test impacted \"<query>\" [--root <path>] [--limit <n>] [--json]",
    "  atlas test run --artifact <artifact-id> [--root <path>] [--json]"
  ].join("\n");
}

async function main() {
  const argv = process.argv.slice(2);
  const { positionals, flags } = parseArgv(argv);
  const command = positionals[0];

  if (!command || command === "help" || command === "--help") {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const handler = commandHandlers[command];
  if (!handler) {
    process.stderr.write(`Unknown command: ${command}\n\n${usage()}\n`);
    process.exitCode = 1;
    return;
  }

  try {
    const result = await handler({
      command,
      args: positionals.slice(1),
      flags
    });
    process.stdout.write(`${formatOutput(result, flags.json)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const output = {
      ok: false,
      error: message
    };
    process.stderr.write(`${formatOutput(output, flags.json)}\n`);
    process.exitCode = 1;
  }
}

await main();
