import fs from "node:fs/promises";
import path from "node:path";

export async function buildContextBundle({ rootDir, task, classification, evidenceMatches, plan, maxFiles = 8, maxCharsPerFile = 1400 }) {
  const orderedPaths = uniquePaths([
    ...plan.likelyFiles,
    ...plan.relatedDependencies,
    ...plan.selectedTests,
    ...evidenceMatches.map((match) => match.path)
  ]).slice(0, maxFiles);

  const queryTokens = tokenizeQuery(task);
  const files = [];
  for (const relativePath of orderedPaths) {
    const absolutePath = path.join(rootDir, relativePath);
    const evidence = evidenceMatches.find((match) => match.path === relativePath);
    let excerpt = "";
    try {
      const content = await fs.readFile(absolutePath, "utf8");
      excerpt = compressContent(content, maxCharsPerFile, {
        symbol: evidence?.symbol,
        tokens: queryTokens
      });
    } catch {
      excerpt = "";
    }

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
    memoryHints: (plan.priorPatterns || []).slice(0, 3).map((pattern) => ({
      summary: pattern.summary,
      outcome: pattern.outcome,
      files: pattern.files || [],
      tests: pattern.tests || []
    })),
    memoryAssistance: plan.memoryAssistance || {
      matchedPatternCount: 0,
      retrievalBoostApplied: false,
      testBoostApplied: false,
      boostedPaths: [],
      boostedTests: []
    },
    validationStrategy: plan.validationStrategy,
    files
  };
}

// Symbol-aware excerpting. When a file exceeds the budget, center the excerpt on
// the matched symbol's region (or the first query-token line) instead of always
// taking the file head — so the model sees the relevant code even when it lives
// far down the file. Falls back to head-truncation when no better anchor exists.
function compressContent(content, maxCharsPerFile, anchor = {}) {
  const lines = content
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line, index, all) => line.length > 0 || (index > 0 && all[index - 1].length > 0));
  const cleaned = lines.join("\n");

  if (cleaned.length <= maxCharsPerFile) {
    return cleaned;
  }

  const anchorIndex = findAnchorLine(lines, anchor);
  if (anchorIndex <= 0) {
    return `${cleaned.slice(0, maxCharsPerFile)}\n...`;
  }

  return windowAroundLine(lines, anchorIndex, maxCharsPerFile);
}

function findAnchorLine(lines, { symbol, tokens } = {}) {
  if (symbol) {
    const needle = String(symbol).toLowerCase();
    const symbolIndex = lines.findIndex((line) => line.toLowerCase().includes(needle));
    if (symbolIndex >= 0) {
      return symbolIndex;
    }
  }

  const queryTokens = (tokens || []).filter((token) => token && token.length >= 3);
  if (queryTokens.length > 0) {
    const tokenIndex = lines.findIndex((line) => {
      const lower = line.toLowerCase();
      return queryTokens.some((token) => lower.includes(token));
    });
    if (tokenIndex >= 0) {
      return tokenIndex;
    }
  }

  return -1;
}

function windowAroundLine(lines, anchorIndex, maxCharsPerFile) {
  const leadingContext = Math.min(anchorIndex, 4);
  let start = anchorIndex - leadingContext;
  let end = anchorIndex;
  let size = lines.slice(start, end + 1).join("\n").length;

  // Fill forward first (a definition's body follows its signature), then use any
  // remaining budget to extend backward for additional leading context.
  while (end < lines.length - 1) {
    const nextLength = lines[end + 1].length + 1;
    if (size + nextLength > maxCharsPerFile) {
      break;
    }
    size += nextLength;
    end += 1;
  }
  while (start > 0) {
    const previousLength = lines[start - 1].length + 1;
    if (size + previousLength > maxCharsPerFile) {
      break;
    }
    size += previousLength;
    start -= 1;
  }

  const parts = [];
  if (start > 0) {
    parts.push("...");
  }
  parts.push(...lines.slice(start, end + 1));
  if (end < lines.length - 1) {
    parts.push("...");
  }
  return parts.join("\n");
}

function tokenizeQuery(task) {
  return String(task || "")
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((token) => token.length >= 3);
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
