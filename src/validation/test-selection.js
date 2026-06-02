import { querySql } from "../core/sqlite.js";
import { findRelevantRunPatterns } from "../core/store.js";

export function selectImpactedTests(dbFile, query, limit = 10) {
  const safeLimit = Math.max(1, Number(limit || 10));
  const tokens = tokenize(query);
  const queryProfile = profileQuery(tokens);
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
      score: scoreEvidenceRow(row, tokens, queryProfile)
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
    const pathMatch = scoreTestPathMatch(testPath, tokens);
    const directCoverage = scoreDirectCoverageMatch(testPath, codePath, seedPaths, tokens, queryProfile, sourceDistance);
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

function scoreEvidenceRow(row, tokens, queryProfile) {
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
  score += scoreImplementationRole(pathValue, queryProfile);
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

function scoreTestPathMatch(testPath, tokens) {
  const pathValue = String(testPath || "").toLowerCase();
  let score = 0;

  for (const token of tokens) {
    if (pathValue.includes(token)) {
      score += 6;
    }
  }

  return score;
}

function scoreDirectCoverageMatch(testPath, codePath, seedPaths, tokens, queryProfile, sourceDistance) {
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

  const entityTokens = entityAnchorTokens(tokens, queryProfile);
  const matchingEntityTokens = entityTokens.filter((token) => testTokens.has(token) || codeTokens.has(token));
  score += matchingEntityTokens.length * 12;

  if (sourceDistance > 1) {
    score -= (sourceDistance - 1) * 8;
  }

  return score;
}

function specificityPenalty(coverCount) {
  return Math.max(0, Number(coverCount || 0) - 1) * 10;
}

function scoreCoverageContribution(existingCoverCount, sourceScore, sourceDistance) {
  const normalizedSourceScore = Number(sourceScore || 0);
  const distance = Math.max(0, Number(sourceDistance || 0));
  const distancePenalty = distance * 12;
  if (existingCoverCount === 0) {
    return Math.max(1, normalizedSourceScore + 5 - distancePenalty);
  }

  return Math.max(1, Math.floor(normalizedSourceScore / 3) + 1 - distance * 4);
}

function normalizeStem(filePath) {
  return String(filePath || "")
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/(^|\/)(test|tests|__tests__)\//g, "/")
    .replace(/(\.|-)(test|spec)\.[^.]+$/g, "")
    .replace(/\.[^.]+$/g, "");
}

function isTestPath(filePath) {
  const normalizedPath = String(filePath || "").toLowerCase().replace(/\\/g, "/");
  return /(^|\/)(test|tests|__tests__)\//.test(normalizedPath) || /\.(test|spec)\./.test(normalizedPath);
}

function profileQuery(tokens) {
  return {
    prefersServiceFiles: tokens.some((token) =>
      ["service", "payments", "payment", "checkout", "charges", "charge"].includes(token)
    ),
    prefersValidationFiles: tokens.some((token) =>
      ["validation", "validate", "validator", "account", "number", "country"].includes(token)
    ),
    prefersMapperFiles: tokens.some((token) => ["mapper", "mapping", "map", "sync", "transform"].includes(token)),
    prefersQueueFiles: tokens.some((token) => ["queue", "retry", "delivery", "enqueue"].includes(token)),
    prefersInngestFiles: tokens.some((token) => ["inngest", "worker", "job", "trigger"].includes(token)),
    prefersGuardFiles: tokens.some((token) => ["guard", "auth", "authorize", "permission"].includes(token))
  };
}

function scoreImplementationRole(pathValue, queryProfile) {
  let score = 0;
  const isServiceFile = pathValue.endsWith(".service.ts") || pathValue.endsWith(".service.js");
  const isResolverFile = pathValue.endsWith(".resolver.ts") || pathValue.endsWith(".resolver.js");
  const isModelFile = pathValue.endsWith(".model.ts") || pathValue.endsWith(".model.js");
  const isValidationFile = pathValue.endsWith(".validation.ts") || pathValue.endsWith(".validation.js");
  const isMapperFile = pathValue.endsWith(".mapper.ts") || pathValue.endsWith(".mapper.js");
  const isQueueFile = /queue\.service\.(ts|js)$/.test(pathValue);
  const isInngestFile = pathValue.endsWith(".inngest.ts") || pathValue.endsWith(".inngest.js");
  const isGuardFile = pathValue.endsWith(".guard.ts") || pathValue.endsWith(".guard.js");
  const isDashboardWrapper = /(^|\/)dashboard-/.test(pathValue);

  if (queryProfile.prefersServiceFiles) {
    if (isServiceFile) score += 10;
    if (isResolverFile) score -= 4;
    if (isModelFile) score -= 3;
  }

  if (queryProfile.prefersValidationFiles) {
    if (isValidationFile) score += 12;
    if (isResolverFile) score -= 4;
    if (isModelFile) score -= 3;
  }

  if (queryProfile.prefersMapperFiles) {
    if (isMapperFile) score += 30;
    if (isResolverFile) score -= 4;
    if (isModelFile) score -= 3;
    if (isServiceFile) score -= 2;
  }

  if (queryProfile.prefersQueueFiles) {
    if (isQueueFile) {
      score += 16;
    } else if (isServiceFile) {
      score += 4;
    }
    if (isResolverFile) score -= 4;
  }

  if (queryProfile.prefersInngestFiles) {
    if (isInngestFile) score += 12;
    if (isResolverFile) score -= 3;
  }

  if (queryProfile.prefersGuardFiles) {
    if (isGuardFile) {
      score += 10;
    } else if (isServiceFile) {
      score += 4;
    }
    if (isResolverFile) score -= 3;
  }

  if (
    queryProfile.prefersServiceFiles ||
    queryProfile.prefersValidationFiles ||
    queryProfile.prefersMapperFiles ||
    queryProfile.prefersQueueFiles ||
    queryProfile.prefersInngestFiles ||
    queryProfile.prefersGuardFiles
  ) {
    if (isDashboardWrapper) score -= 5;
  }

  return score;
}

function entityAnchorTokens(tokens, queryProfile) {
  const roleTokens = new Set([
    "service",
    "validation",
    "validate",
    "validator",
    "account",
    "number",
    "country",
    "mapper",
    "mapping",
    "sync",
    "queue",
    "retry",
    "delivery",
    "guard",
    "auth",
    "api",
    "key",
    "current",
    "app",
    "provider",
    "event",
    "processing",
    "webhook",
    "tenant",
    "inngest",
    "worker",
    "job",
    "trigger",
    "payments",
    "payment",
    "checkout",
    "charges",
    "charge"
  ]);
  const anchors = tokens.filter((token) => !roleTokens.has(token));
  if (anchors.length > 0) {
    return anchors;
  }
  if (queryProfile.prefersGuardFiles) {
    return tokens.filter((token) => ["auth"].includes(token));
  }
  return [];
}

function pathTokens(filePath) {
  return String(filePath || "")
    .toLowerCase()
    .replace(/\\/g, "/")
    .split(/[^a-z0-9_]+/)
    .filter((token) => token.length >= 3);
}
