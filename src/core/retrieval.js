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
  return {
    prefersSourceFiles
  };
}

function buildMemoryBoosts(patterns) {
  const files = new Map();
  let matchedPatternCount = 0;

  for (const pattern of patterns || []) {
    if (pattern.outcome !== "confirmed") {
      continue;
    }
    matchedPatternCount += 1;
    for (const filePath of pattern.files || []) {
      files.set(filePath, Math.min(3, (files.get(filePath) || 0) + 2));
    }
  }

  return {
    files,
    matchedPatternCount
  };
}
