import { querySql } from "../core/sqlite.js";
import { findRelevantRunPatterns } from "../core/store.js";

// General, domain-agnostic impacted-test selection.
//
// As in retrieval.js, there is no domain vocabulary or filename-convention table.
// Seeds are chosen by IDF-weighted lexical overlap with the repo's own corpus;
// impacted code is expanded over the dependency graph; tests are ranked by how
// directly they cover impacted code (graph coverage + cross-language stem match +
// IDF-weighted shared path tokens).

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

  const idf = computeIdf(evidenceRows, tokens);

  const scoredFiles = evidenceRows
    .map((row) => ({
      path: row.path,
      score: scoreEvidenceRow(row, tokens, idf)
    }))
    .filter((row) => !isTestPath(row.path))
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));

  const seedPaths = scoredFiles.slice(0, safeLimit).map((row) => row.path);
  const impactedEntries = expandImpactedPaths(dbFile, seedPaths);
  const impactedPaths = impactedEntries.map((entry) => entry.path);
  const impactedDistance = new Map(impactedEntries.map((entry) => [entry.path, entry.distance]));
  const scoredFileMap = new Map(scoredFiles.map((file) => [file.path, file]));
  if (impactedPaths.length === 0) {
    return {
      impactedFiles: [],
      tests: [],
      memoryAssistance: {
        matchedPatternCount: memoryBoosts.matchedPatternCount,
        ignoredPatternCount: memoryBoosts.ignoredPatternCount,
        ignoredOutcomes: memoryBoosts.ignoredOutcomes,
        testBoostApplied: memoryBoosts.tests.size > 0,
        boostedTests: [...memoryBoosts.tests.keys()]
      }
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
      covers: new Set(),
      scoreBreakdown: {
        coverageContribution: 0,
        pathMatch: 0,
        directCoverage: 0
      },
      coverDetails: []
    };
    if (prior.covers.has(codePath)) {
      continue;
    }
    const sourceScore = scoredFileMap.get(codePath)?.score || (seedPaths.includes(codePath) ? 3 : 1);
    const sourceDistance = impactedDistance.get(codePath) ?? 3;
    const coverageContribution = scoreCoverageContribution(prior.covers.size, sourceScore, sourceDistance);
    const pathMatch = scoreTestPathMatch(testPath, tokens, idf);
    const directCoverage = scoreDirectCoverageMatch(testPath, codePath, seedPaths, tokens, idf, sourceDistance);
    prior.score += coverageContribution;
    prior.score += pathMatch;
    prior.score += directCoverage;
    prior.scoreBreakdown.coverageContribution += coverageContribution;
    prior.scoreBreakdown.pathMatch += pathMatch;
    prior.scoreBreakdown.directCoverage += directCoverage;
    prior.coverDetails.push({
      path: codePath,
      seed: seedPaths.includes(codePath),
      graphDistance: sourceDistance,
      sourceScore
    });
    prior.covers.add(codePath);
    testScores.set(testPath, prior);
  }

  const tests = [...testScores.values()]
    .map((entry) => ({
      constMemoryBoost: memoryBoosts.tests.get(entry.path) || 0,
      constSpecificityPenalty: specificityPenalty(entry.covers.size),
      entry
    }))
    .map(({ entry, constMemoryBoost, constSpecificityPenalty }) => ({
      path: entry.path,
      score: entry.score + constMemoryBoost - constSpecificityPenalty,
      covers: [...entry.covers],
      coverDetails: entry.coverDetails,
      scoreBreakdown: {
        ...entry.scoreBreakdown,
        memoryBoost: constMemoryBoost,
        specificityPenalty: constSpecificityPenalty
      }
    }))
    .sort((left, right) => right.score - left.score || left.covers.length - right.covers.length || left.path.localeCompare(right.path))
    .slice(0, safeLimit);

  return {
    impactedFiles: impactedPaths,
    tests,
    memoryAssistance: {
      matchedPatternCount: memoryBoosts.matchedPatternCount,
      ignoredPatternCount: memoryBoosts.ignoredPatternCount,
      ignoredOutcomes: memoryBoosts.ignoredOutcomes,
      testBoostApplied: memoryBoosts.tests.size > 0,
      boostedTests: [...memoryBoosts.tests.keys()]
    }
  };
}

function expandImpactedPaths(dbFile, seedPaths) {
  if (seedPaths.length === 0) {
    return [];
  }

  const queue = seedPaths.map((path) => ({ path, distance: 0 }));
  const visited = new Map(seedPaths.map((path) => [path, 0]));

  while (queue.length > 0) {
    const { path: currentPath, distance } = queue.shift();
    if (distance >= 2) {
      continue;
    }
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
      if (!candidate || visited.has(candidate) || isTestPath(candidate)) {
        continue;
      }
      visited.set(candidate, distance + 1);
      queue.push({ path: candidate, distance: distance + 1 });
    }
  }

  return [...visited.entries()].map(([path, distance]) => ({ path, distance }));
}

// Inverse document frequency for query tokens across the indexed corpus — lets the
// repo's own rare terms drive ranking instead of a hardcoded vocabulary.
function computeIdf(rows, tokens) {
  const total = rows.length || 1;
  const idf = new Map();
  for (const token of tokens) {
    let documentFrequency = 0;
    for (const row of rows) {
      const text = `${row.path || ""} ${row.summary || ""} ${row.symbols || ""}`.toLowerCase();
      if (text.includes(token)) {
        documentFrequency += 1;
      }
    }
    const weight = Math.log((total + 1) / (documentFrequency + 1));
    idf.set(token, Math.max(0.2, weight));
  }
  return idf;
}

function scoreEvidenceRow(row, tokens, idf) {
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
    const weight = idf.get(token) || 0.2;
    if (pathValue.includes(token)) {
      score += 5 * weight;
    }
    if (summaryValue.includes(token)) {
      score += 2 * weight;
    }
    for (const symbol of symbolValues) {
      if (symbol.includes(token)) {
        score += 4 * weight;
      }
    }
  }
  return Math.round(score * 100) / 100;
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
  let matchedPatternCount = 0;
  let ignoredPatternCount = 0;
  const ignoredOutcomes = new Set();

  for (const pattern of patterns || []) {
    if (pattern.outcome !== "confirmed") {
      ignoredPatternCount += 1;
      ignoredOutcomes.add(pattern.outcome || "unknown");
      continue;
    }
    matchedPatternCount += 1;
    for (const testPath of pattern.tests || []) {
      tests.set(testPath, Math.min(3, (tests.get(testPath) || 0) + 2));
    }
  }

  return {
    tests,
    matchedPatternCount,
    ignoredPatternCount,
    ignoredOutcomes: [...ignoredOutcomes]
  };
}

function scoreTestPathMatch(testPath, tokens, idf) {
  const pathValue = String(testPath || "").toLowerCase();
  let score = 0;

  for (const token of tokens) {
    if (pathValue.includes(token)) {
      score += 6 * (idf.get(token) || 0.2);
    }
  }

  return Math.round(score * 100) / 100;
}

function scoreDirectCoverageMatch(testPath, codePath, seedPaths, tokens, idf, sourceDistance) {
  const normalizedTestStem = normalizeStem(testPath);
  const normalizedCodeStem = normalizeStem(codePath);
  const testTokens = new Set(pathTokens(testPath));
  const codeTokens = new Set(pathTokens(codePath));
  let score = 0;

  if (normalizedTestStem === normalizedCodeStem) {
    score += 45;
  }

  const seeded = seedPaths.includes(codePath);
  if (seeded && tokens.some((token) => normalizedCodeStem.includes(token))) {
    score += 18;
  }

  if (seeded) {
    score += 16;
  } else if (sourceDistance === 1) {
    score += 4;
  }

  const sharedQueryPathTokens = tokens.filter((token) => testTokens.has(token) && codeTokens.has(token)).length;
  score += sharedQueryPathTokens * 4;

  // IDF-weighted distinctive-token overlap. Replaces the old hardcoded role-token
  // exclusion list: a token's discriminative power is measured from the corpus, so
  // distinctive entity terms count and ubiquitous terms fall away — no word list.
  for (const token of tokens) {
    if (testTokens.has(token) || codeTokens.has(token)) {
      score += 12 * (idf.get(token) || 0.2);
    }
  }

  if (sourceDistance > 1) {
    score -= (sourceDistance - 1) * 8;
  }

  return Math.round(score * 100) / 100;
}

function specificityPenalty(coverCount) {
  return Math.max(0, Number(coverCount || 0) - 1) * 10;
}

function scoreCoverageContribution(existingCoverCount, sourceScore, sourceDistance) {
  const normalizedSourceScore = Number(sourceScore || 0);
  const distance = Math.max(0, Number(sourceDistance || 0));
  const distancePenalty = distance * 12;
  if (existingCoverCount === 0) {
    return Math.max(1, Math.round(normalizedSourceScore + 5 - distancePenalty));
  }

  return Math.max(1, Math.round(normalizedSourceScore / 3) + 1 - distance * 4);
}

// Basename-level stem, with cross-language test affixes stripped (JS/TS
// `.test`/`.spec`, Python `test_` prefix, Go/Ruby `_test`/`_spec` suffix,
// Java/Go `Test`/`Spec` PascalCase). Reducing to basename lets a test in a
// parallel directory (e.g. `tests/foo_test.go` vs `inventory/foo.go`) link to its
// source without relying on import resolution, which only exists for JS/TS.
function normalizeStem(filePath) {
  let base = String(filePath || "").replace(/\\/g, "/");
  base = base.slice(base.lastIndexOf("/") + 1);
  base = base.replace(/\.[^.]+$/, "");
  base = base.replace(/(Test|Spec)$/, "");
  base = base.replace(/^(test|spec)[._-]+/i, "");
  base = base.replace(/[._-]+(test|spec)$/i, "");
  return base.toLowerCase();
}

function isTestPath(filePath) {
  const normalizedPath = String(filePath || "").toLowerCase().replace(/\\/g, "/");
  if (/(^|\/)(tests?|__tests__|specs?)\//.test(normalizedPath)) {
    return true;
  }
  const base = (normalizedPath.split("/").pop() || "").replace(/\.[^.]+$/, "");
  return /(^|[._-])(test|spec)([._-]|$)/.test(base) || /[a-z](test|spec)$/.test(base);
}

function pathTokens(filePath) {
  return String(filePath || "")
    .toLowerCase()
    .replace(/\\/g, "/")
    .split(/[^a-z0-9_]+/)
    .filter((token) => token.length >= 3);
}
