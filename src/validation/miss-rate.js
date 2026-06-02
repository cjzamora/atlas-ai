import fs from "node:fs/promises";
import path from "node:path";
import { selectImpactedTests } from "./test-selection.js";
import { runSelectedTests } from "./test-runner.js";

const IGNORED_DIRS = new Set([".git", ".atlas", "node_modules", "dist", "coverage", ".next", "build"]);

// Quantifies the trust level of the confirm step: how often a full-suite failure
// would be MISSED by impacted-test selection. Runs the whole (runnable) suite once,
// then compares its failures against what selection picked for the query.
//
// Scoped to JS/TS test files, because the validation runner executes via a JS
// module-probe — non-JS suites can't be run here, so they are not counted.
export async function measureSelectionMissRate({ rootDir, dbFile, query, limit = 10 }) {
  const selection = selectImpactedTests(dbFile, query, limit);
  const selectedTests = selection.tests.map((entry) => entry.path);

  const allTestFiles = await discoverRunnableTestFiles(rootDir);
  const full = await runSelectedTests({ rootDir, selectedTests: allTestFiles });
  const failingTests = full.results
    .filter((result) => result.status === "failed")
    .map((result) => result.path);

  const selectedSet = new Set(selectedTests);
  const coveredFailures = failingTests.filter((testPath) => selectedSet.has(testPath));
  const missedFailures = failingTests.filter((testPath) => !selectedSet.has(testPath));
  const missRate = failingTests.length === 0 ? 0 : missedFailures.length / failingTests.length;

  return {
    query,
    selectedTests,
    totalTestFiles: allTestFiles.length,
    failingTests,
    coveredFailures,
    missedFailures,
    missRate,
    fullSummary: full.summary
  };
}

async function discoverRunnableTestFiles(rootDir) {
  const found = [];
  await walk(rootDir, rootDir, found);
  return found.sort();
}

async function walk(rootDir, currentDir, found) {
  let entries;
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        await walk(rootDir, absolutePath, found);
      }
      continue;
    }
    const relativePath = path.relative(rootDir, absolutePath).replace(/\\/g, "/");
    if (isRunnableExtension(relativePath) && isTestPath(relativePath)) {
      found.push(relativePath);
    }
  }
}

function isRunnableExtension(filePath) {
  return /\.(js|mjs|cjs|ts|tsx|jsx)$/.test(filePath);
}

function isTestPath(filePath) {
  const normalizedPath = String(filePath || "").toLowerCase();
  if (/(^|\/)(tests?|__tests__|specs?)\//.test(normalizedPath)) {
    return true;
  }
  const base = (normalizedPath.split("/").pop() || "").replace(/\.[^.]+$/, "");
  return /(^|[._-])(test|spec)([._-]|$)/.test(base) || /[a-z](test|spec)$/.test(base);
}
