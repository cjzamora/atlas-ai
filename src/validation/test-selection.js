import { querySql } from "../core/sqlite.js";
import { findRelevantRunPatterns } from "../core/store.js";

export function selectImpactedTests(dbFile, query, limit = 10) {
  const safeLimit = Math.max(1, Number(limit || 10));
  const tokens = tokenize(query);
  const memoryBoosts = buildMemoryBoosts(findRelevantRunPatterns(dbFile, query, 3));

  const evidenceRows = querySql(
    dbFile,
    `
      select
        f.path,
        f.summary,
        ifnull(group_concat(distinct s.name), '') as symbols
      from files f
      left join symbols s on s.file_path = f.path
      group by f.path, f.summary;
    `
  );

  const scoredFiles = evidenceRows
    .map((row) => ({
      path: row.path,
      score: scoreEvidenceRow(row, tokens)
    }))
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));

  const seedPaths = scoredFiles.slice(0, safeLimit).map((row) => row.path);
  const impactedPaths = expandImpactedPaths(dbFile, seedPaths);
  if (impactedPaths.length === 0) {
    return {
      impactedFiles: [],
      tests: []
    };
  }

  const escapedPaths = impactedPaths.map((filePath) => `'${escapeSql(filePath)}'`).join(", ");
  const testRows = querySql(
    dbFile,
    `
      select
        source_path as testPath,
        target_path as codePath,
        edge_type as edgeType
      from edges
      where edge_type in ('tests', 'tested_by')
        and (source_path in (${escapedPaths}) or target_path in (${escapedPaths}));
    `
  );

  const testScores = new Map();
  for (const row of testRows) {
    const testPath = row.edgeType === "tests" ? row.testPath : row.codePath;
    const codePath = row.edgeType === "tests" ? row.codePath : row.testPath;
    if (!testPath || !codePath) {
      continue;
    }

    const prior = testScores.get(testPath) || {
      path: testPath,
      score: 0,
      covers: new Set()
    };
    const sourceScore = scoredFiles.find((file) => file.path === codePath)?.score || (seedPaths.includes(codePath) ? 3 : 1);
    prior.score += sourceScore + 5;
    prior.covers.add(codePath);
    testScores.set(testPath, prior);
  }

  const tests = [...testScores.values()]
    .map((entry) => ({
      path: entry.path,
      score: entry.score + (memoryBoosts.tests.get(entry.path) || 0),
      covers: [...entry.covers]
    }))
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, safeLimit);

  return {
    impactedFiles: impactedPaths,
    tests
  };
}

function expandImpactedPaths(dbFile, seedPaths) {
  if (seedPaths.length === 0) {
    return [];
  }

  const queue = [...seedPaths];
  const visited = new Set(seedPaths);

  while (queue.length > 0) {
    const currentPath = queue.shift();
    const adjacent = querySql(
      dbFile,
      `
        select source_path as sourcePath, target_path as targetPath, edge_type as edgeType
        from edges
        where edge_type in ('import', 'call')
          and (source_path = '${escapeSql(currentPath)}' or target_path = '${escapeSql(currentPath)}');
      `
    );

    for (const edge of adjacent) {
      const candidate = edge.sourcePath === currentPath ? edge.targetPath : edge.sourcePath;
      if (!candidate || visited.has(candidate)) {
        continue;
      }
      visited.add(candidate);
      queue.push(candidate);
    }
  }

  return [...visited];
}

function scoreEvidenceRow(row, tokens) {
  if (tokens.length === 0) {
    return 0;
  }

  const pathValue = String(row.path || "").toLowerCase();
  const summaryValue = String(row.summary || "").toLowerCase();
  const symbolValues = String(row.symbols || "")
    .split(",")
    .filter(Boolean)
    .map((symbol) => symbol.toLowerCase());

  let score = 0;
  for (const token of tokens) {
    if (pathValue.includes(token)) {
      score += 5;
    }
    if (summaryValue.includes(token)) {
      score += 2;
    }
    for (const symbol of symbolValues) {
      if (symbol.includes(token)) {
        score += 4;
      }
    }
  }
  return score;
}

function tokenize(query) {
  return String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((token) => token.length >= 3);
}

function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}

function buildMemoryBoosts(patterns) {
  const tests = new Map();

  for (const pattern of patterns || []) {
    if (pattern.outcome !== "confirmed") {
      continue;
    }
    for (const testPath of pattern.tests || []) {
      tests.set(testPath, Math.min(3, (tests.get(testPath) || 0) + 2));
    }
  }

  return {
    tests
  };
}
