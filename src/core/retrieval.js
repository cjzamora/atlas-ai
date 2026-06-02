import { querySql } from "./sqlite.js";
import { findRelevantRunPatterns } from "./store.js";

export function searchEvidence(dbFile, query, limit) {
  const safeLimit = Number.isFinite(limit) ? limit : 5;
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return { matches: [] };
  }
  const queryProfile = profileQuery(tokens);
  const memoryBoosts = buildMemoryBoosts(findRelevantRunPatterns(dbFile, query, 3));

  const rows = querySql(
    dbFile,
    `
      select
        f.path,
        f.language,
        f.summary,
        ifnull(group_concat(distinct s.name), '') as symbols,
        ifnull(group_concat(distinct case when e.edge_type = 'import' then e.target_path end), '') as outgoing_targets,
        ifnull(group_concat(distinct reverse_edges.source_path), '') as incoming_sources,
        ifnull(group_concat(distinct case when e.edge_type = 'call' and e.target_path <> '' then e.specifier end), '') as outgoing_calls,
        ifnull(group_concat(distinct case when e.edge_type = 'call' then e.target_path end), '') as outgoing_call_targets,
        ifnull(group_concat(distinct case when e.edge_type = 'tests' then e.target_path end), '') as test_targets,
        ifnull(group_concat(distinct reverse_test_edges.source_path), '') as tested_by_sources
      from files f
      left join symbols s on s.file_path = f.path
      left join edges e on e.source_path = f.path
      left join edges reverse_edges on reverse_edges.target_path = f.path and reverse_edges.edge_type = 'import'
      left join edges reverse_test_edges on reverse_test_edges.target_path = f.path and reverse_test_edges.edge_type = 'tests'
      group by f.path, f.language, f.summary;
    `
  );

  const matches = rows
    .map((row) => scoreRow(row, tokens, queryProfile, memoryBoosts))
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, Math.max(1, safeLimit));

  return {
    matches,
    memoryAssistance: {
      matchedPatternCount: memoryBoosts.matchedPatternCount,
      ignoredPatternCount: memoryBoosts.ignoredPatternCount,
      ignoredOutcomes: memoryBoosts.ignoredOutcomes,
      retrievalBoostApplied: memoryBoosts.files.size > 0,
      boostedPaths: [...memoryBoosts.files.keys()]
    }
  };
}

function scoreRow(row, tokens, queryProfile, memoryBoosts) {
  const haystack = {
    path: String(row.path || "").toLowerCase(),
    summary: String(row.summary || "").toLowerCase(),
    symbols: String(row.symbols || "")
      .split(",")
      .filter(Boolean),
    outgoingTargets: String(row.outgoing_targets || "")
      .split(",")
      .filter(Boolean),
    incomingSources: String(row.incoming_sources || "")
      .split(",")
      .filter(Boolean),
    outgoingCalls: String(row.outgoing_calls || "")
      .split(",")
      .filter(Boolean),
    outgoingCallTargets: String(row.outgoing_call_targets || "")
      .split(",")
      .filter(Boolean),
    testTargets: String(row.test_targets || "")
      .split(",")
      .filter(Boolean),
    testedBySources: String(row.tested_by_sources || "")
      .split(",")
      .filter(Boolean)
  };

  let score = 0;
  const matchedSymbols = [];

  for (const token of tokens) {
    if (haystack.path.includes(token)) {
      score += 5;
    }
    if (haystack.summary.includes(token)) {
      score += 2;
    }

    for (const symbol of haystack.symbols) {
      if (symbol.toLowerCase().includes(token)) {
        score += 4;
        matchedSymbols.push(symbol);
      }
    }

    for (const target of haystack.outgoingTargets) {
      if (target.toLowerCase().includes(token)) {
        score += 3;
      }
    }

    for (const source of haystack.incomingSources) {
      if (source.toLowerCase().includes(token)) {
        score += 3;
      }
    }

    for (const call of haystack.outgoingCalls) {
      if (call.toLowerCase().includes(token)) {
        score += 2;
      }
    }

    for (const callTarget of haystack.outgoingCallTargets) {
      if (callTarget.toLowerCase().includes(token)) {
        score += 3;
      }
    }

    for (const testTarget of haystack.testTargets) {
      if (testTarget.toLowerCase().includes(token)) {
        score += 4;
      }
    }

    for (const testedBy of haystack.testedBySources) {
      if (testedBy.toLowerCase().includes(token)) {
        score += 4;
      }
    }
  }

  if (queryProfile.prefersSourceFiles) {
    const isTestFile = /(^|\/)(test|tests)\//.test(haystack.path) || /\.test\./.test(haystack.path);
    const isSourceFile = /(^|\/)src\//.test(haystack.path);
    if (isTestFile) {
      score -= 6;
    } else {
      score += 2;
    }
    if (isSourceFile) {
      score += 3;
    }
  }

  score += scoreImplementationRole(haystack.path, queryProfile);
  score += scoreModuleAnchor(haystack.path, queryProfile);

  score += memoryBoosts.files.get(row.path) || 0;

  return {
    path: row.path,
    language: row.language,
    summary: row.summary,
    symbol: matchedSymbols[0],
    score,
    relatedPaths: [...new Set([
      ...haystack.outgoingTargets,
      ...haystack.incomingSources,
      ...haystack.outgoingCallTargets,
      ...haystack.testTargets,
      ...haystack.testedBySources
    ].filter(Boolean))].slice(0, 10),
    callHints: [...new Set(haystack.outgoingCalls)].slice(0, 8),
    testPaths: [...new Set([...haystack.testTargets, ...haystack.testedBySources])].slice(0, 6)
  };
}

function tokenize(query) {
  return query
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function profileQuery(tokens) {
  const prefersSourceFiles = tokens.some((token) => ["fix", "bug", "issue", "regression", "fallback"].includes(token));
  const prefersServiceFiles = tokens.some((token) =>
    ["service", "payments", "payment", "checkout", "charges", "charge"].includes(token)
  );
  const prefersValidationFiles = tokens.some((token) =>
    ["validation", "validate", "validator", "account", "number", "country"].includes(token)
  );
  const prefersMapperFiles = tokens.some((token) =>
    ["mapper", "mapping", "map", "sync", "transform"].includes(token)
  );
  const prefersQueueFiles = tokens.some((token) =>
    ["queue", "retry", "delivery", "enqueue"].includes(token)
  );
  const prefersInngestFiles = tokens.some((token) =>
    ["inngest", "worker", "job", "trigger"].includes(token)
  );
  const prefersGuardFiles = tokens.some((token) =>
    ["guard", "auth", "authorize", "permission"].includes(token)
  );
  const prefersControllerFiles = tokens.some((token) =>
    ["controller", "signature", "hmac", "raw", "received"].includes(token)
  );
  return {
    prefersSourceFiles,
    prefersServiceFiles,
    prefersValidationFiles,
    prefersMapperFiles,
    prefersQueueFiles,
    prefersInngestFiles,
    prefersGuardFiles,
    prefersControllerFiles,
    anchorTokens: entityAnchorTokens(tokens)
  };
}

function scoreImplementationRole(pathValue, queryProfile) {
  let score = 0;
  const isServiceFile = pathValue.endsWith(".service.ts") || pathValue.endsWith(".service.js");
  const isResolverFile = pathValue.endsWith(".resolver.ts") || pathValue.endsWith(".resolver.js");
  const isControllerFile = pathValue.endsWith(".controller.ts") || pathValue.endsWith(".controller.js");
  const isModelFile = pathValue.endsWith(".model.ts") || pathValue.endsWith(".model.js");
  const isValidationFile = pathValue.endsWith(".validation.ts") || pathValue.endsWith(".validation.js");
  const isMapperFile = pathValue.endsWith(".mapper.ts") || pathValue.endsWith(".mapper.js");
  const isQueueFile = /queue\.service\.(ts|js)$/.test(pathValue);
  const isInngestFile = pathValue.endsWith(".inngest.ts") || pathValue.endsWith(".inngest.js");
  const isGuardFile = pathValue.endsWith(".guard.ts") || pathValue.endsWith(".guard.js");
  const isDashboardWrapper = /(^|\/)dashboard-/.test(pathValue);

  if (queryProfile.prefersServiceFiles) {
    if (isServiceFile) {
      score += 30;
    }
    if (isResolverFile) {
      score -= 35;
    }
    if (isModelFile) {
      score -= 75;
    }
  }

  if (queryProfile.prefersValidationFiles) {
    if (isValidationFile) {
      score += 12;
    }
    if (isResolverFile) {
      score -= 4;
    }
    if (isModelFile) {
      score -= 3;
    }
  }

  if (queryProfile.prefersMapperFiles) {
    if (isMapperFile) {
      score += 30;
    }
    if (isResolverFile) {
      score -= 4;
    }
    if (isModelFile) {
      score -= 3;
    }
    if (isServiceFile) {
      score -= 2;
    }
  }

  if (queryProfile.prefersQueueFiles) {
    if (isQueueFile) {
      score += 16;
    } else if (isServiceFile) {
      score += 4;
    }
    if (isResolverFile) {
      score -= 4;
    }
  }

  if (queryProfile.prefersControllerFiles) {
    if (isControllerFile) {
      score += 70;
    }
    if (isResolverFile) {
      score -= 20;
    }
    if (isModelFile) {
      score -= 40;
    }
  }

  if (queryProfile.prefersInngestFiles) {
    if (isInngestFile) {
      score += 12;
    }
    if (isResolverFile) {
      score -= 3;
    }
  }

  if (queryProfile.prefersGuardFiles) {
    if (isGuardFile) {
      score += 10;
    } else if (isServiceFile) {
      score += 4;
    }
    if (isResolverFile) {
      score -= 3;
    }
  }

  if (
    queryProfile.prefersServiceFiles ||
    queryProfile.prefersValidationFiles ||
    queryProfile.prefersMapperFiles ||
    queryProfile.prefersQueueFiles ||
    queryProfile.prefersInngestFiles ||
    queryProfile.prefersGuardFiles ||
    queryProfile.prefersControllerFiles
  ) {
    if (isDashboardWrapper) {
      score -= 5;
    }
  }

  return score;
}

function scoreModuleAnchor(pathValue, queryProfile) {
  const anchors = queryProfile.anchorTokens || [];
  if (anchors.length === 0) {
    return 0;
  }

  const matchedAnchors = anchors.filter((token) => pathValue.includes(token));
  if (matchedAnchors.length > 0) {
    return matchedAnchors.length * 18;
  }

  return -18;
}

function entityAnchorTokens(tokens) {
  const roleTokens = new Set([
    "service",
    "payments",
    "payment",
    "checkout",
    "charges",
    "charge",
    "validation",
    "validate",
    "validator",
    "account",
    "number",
    "country",
    "mapper",
    "mapping",
    "map",
    "sync",
    "transform",
    "queue",
    "retry",
    "delivery",
    "enqueue",
    "inngest",
    "worker",
    "job",
    "trigger",
    "guard",
    "auth",
    "authorize",
    "permission",
    "controller",
    "signature",
    "hmac",
    "raw",
    "received",
    "webhook",
    "inbound",
    "event",
    "provider",
    "tenant",
    "connected",
    "onboarding",
    "login",
    "link",
    "list",
    "current",
    "key",
    "api",
    "fix",
    "bug",
    "issue",
    "regression",
    "fallback"
  ]);

  return tokens.filter((token) => !roleTokens.has(token));
}

function buildMemoryBoosts(patterns) {
  const files = new Map();
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
    for (const filePath of pattern.files || []) {
      files.set(filePath, Math.min(3, (files.get(filePath) || 0) + 2));
    }
  }

  return {
    files,
    matchedPatternCount,
    ignoredPatternCount,
    ignoredOutcomes: [...ignoredOutcomes]
  };
}
