import fs from "node:fs/promises";
import path from "node:path";

export async function buildContextBundle({ rootDir, task, classification, evidenceMatches, plan, maxFiles = 8, maxCharsPerFile = 1400 }) {
  const orderedPaths = uniquePaths([
    ...plan.likelyFiles,
    ...plan.relatedDependencies,
    ...plan.selectedTests,
    ...evidenceMatches.map((match) => match.path)
  ]).slice(0, maxFiles);

  const files = [];
  for (const relativePath of orderedPaths) {
    const absolutePath = path.join(rootDir, relativePath);
    let excerpt = "";
    try {
      const content = await fs.readFile(absolutePath, "utf8");
      excerpt = compressContent(content, maxCharsPerFile);
    } catch {
      excerpt = "";
    }

    const evidence = evidenceMatches.find((match) => match.path === relativePath);
    files.push({
      path: relativePath,
      role: classifyFileRole(relativePath, plan),
      summary: evidence?.summary,
      symbol: evidence?.symbol,
      excerpt
    });
  }

  return {
    task,
    classification,
    codexReady: plan.codexNeeded,
    contextBudget: classification.contextBudget,
    summary: plan.summary,
    likelyFiles: plan.likelyFiles,
    relatedDependencies: plan.relatedDependencies,
    selectedTests: plan.selectedTests,
    callHints: plan.callHints,
    validationStrategy: plan.validationStrategy,
    files
  };
}

function compressContent(content, maxCharsPerFile) {
  const cleaned = content
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line, index, lines) => line.length > 0 || (index > 0 && lines[index - 1].length > 0))
    .join("\n");

  if (cleaned.length <= maxCharsPerFile) {
    return cleaned;
  }

  return `${cleaned.slice(0, maxCharsPerFile)}\n...`;
}

function classifyFileRole(relativePath, plan) {
  if (plan.selectedTests.includes(relativePath)) {
    return "selected_test";
  }
  if (plan.likelyFiles.includes(relativePath)) {
    return "primary";
  }
  if (plan.relatedDependencies.includes(relativePath)) {
    return "dependency";
  }
  return "supporting";
}

function uniquePaths(paths) {
  return [...new Set(paths.filter(Boolean))];
}
