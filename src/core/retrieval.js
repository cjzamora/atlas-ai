import { querySql } from "./sqlite.js";
import { findRelevantRunPatterns } from "./store.js";

// General, domain-agnostic scoring weights.
//
// There is deliberately NO domain vocabulary and NO filename-convention table here.
// Relevance is derived from the repository itself:
//   - lexical token overlap (path / summary / symbols / graph-neighbour names),
//     each weighted by the token's inverse document frequency (IDF) across the
//     indexed corpus, so a repo's own rare, discriminative terms dominate and
//     ubiquitous terms decay toward zero;
//   - structural centrality (how many files import or test a file), a repo-derived
//     proxy for "this file holds shared implementation" that needs no naming rules.
const WEIGHTS = {
  pathToken: 8,
  symbolToken: 6,
  summaryToken: 2,
  importNeighborToken: 3,
  callSpecifierToken: 2,
  callTargetToken: 3,
  testNeighborToken: 4,
  centralityMax: 10,
  centralityScale: 4,
  // evidence retrieval surfaces implementation; tests are surfaced separately
  // (impacted-test selection). De-prioritise test files PROPORTIONALLY so a test
  // ranks below an equally-matching source, while a strongly-matching test can
  // still surface. A factor scales with match strength and carries no domain or
  // absolute-magnitude tuning.
  testEvidenceFactor: 0.5
};

export function searchEvidence(dbFile, query, limit) {
  const safeLimit = Number.isFinite(limit) ? limit : 5;
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return { matches: [] };
  }
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

  const idf = computeIdf(rows, tokens);

  const matches = rows
    .map((row) => scoreRow(row, tokens, idf, memoryBoosts))
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

// Inverse document frequency for each query token over the indexed corpus.
// Tokens that appear in every file carry ~0 weight (floored small); tokens that
// appear in few files carry the most weight. This is what replaces the old
// hardcoded "this word means a service/guard/mapper" vocabulary.
function computeIdf(rows, tokens) {
  const total = rows.length || 1;
  const idf = new Map();
  for (const token of tokens) {
    let documentFrequency = 0;
    for (const row of rows) {
      if (rowSearchText(row).includes(token)) {
        documentFrequency += 1;
      }
    }
    const weight = Math.log((total + 1) / (documentFrequency + 1));
    idf.set(token, Math.max(0.2, weight));
  }
  return idf;
}

function rowSearchText(row) {
  return `${row.path || ""} ${row.summary || ""} ${row.symbols || ""}`.toLowerCase();
}

function scoreRow(row, tokens, idf, memoryBoosts) {
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

  let lexical = 0;
  const matchedSymbols = [];

  for (const token of tokens) {
    const weight = idf.get(token) || 0.2;

    if (haystack.path.includes(token)) {
      lexical += WEIGHTS.pathToken * weight;
    }
    if (haystack.summary.includes(token)) {
      lexical += WEIGHTS.summaryToken * weight;
    }

    for (const symbol of haystack.symbols) {
      if (symbol.toLowerCase().includes(token)) {
        lexical += WEIGHTS.symbolToken * weight;
        matchedSymbols.push(symbol);
      }
    }

    for (const target of haystack.outgoingTargets) {
      if (target.toLowerCase().includes(token)) {
        lexical += WEIGHTS.importNeighborToken * weight;
      }
    }

    for (const source of haystack.incomingSources) {
      if (source.toLowerCase().includes(token)) {
        lexical += WEIGHTS.importNeighborToken * weight;
      }
    }

    for (const call of haystack.outgoingCalls) {
      if (call.toLowerCase().includes(token)) {
        lexical += WEIGHTS.callSpecifierToken * weight;
      }
    }

    for (const callTarget of haystack.outgoingCallTargets) {
      if (callTarget.toLowerCase().includes(token)) {
        lexical += WEIGHTS.callTargetToken * weight;
      }
    }

    for (const testTarget of haystack.testTargets) {
      if (testTarget.toLowerCase().includes(token)) {
        lexical += WEIGHTS.testNeighborToken * weight;
      }
    }

    for (const testedBy of haystack.testedBySources) {
      if (testedBy.toLowerCase().includes(token)) {
        lexical += WEIGHTS.testNeighborToken * weight;
      }
    }
  }

  let score = lexical;

  if (lexical > 0) {
    // Structural centrality: files that many others import or that have tests are
    // more likely to be the implementation a query is about. Derived from the
    // graph, so it carries no language or domain assumptions.
    const fanIn = haystack.incomingSources.length + haystack.testedBySources.length;
    score += Math.min(WEIGHTS.centralityMax, Math.log2(1 + fanIn) * WEIGHTS.centralityScale);

    if (isTestPath(haystack.path)) {
      score *= WEIGHTS.testEvidenceFactor;
    }
  }

  score += memoryBoosts.files.get(row.path) || 0;

  return {
    path: row.path,
    language: row.language,
    summary: row.summary,
    symbol: matchedSymbols[0],
    score: Math.round(score * 100) / 100,
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

// Recognises test files across languages and conventions (JS/TS `.test`/`.spec`,
// Python `test_` prefix, Go/Ruby `_test`/`_spec` suffix, Java/Go `Test`/`Spec`
// PascalCase, and `test`/`tests`/`__tests__`/`spec`/`specs` directories) without
// encoding any domain knowledge.
function isTestPath(filePath) {
  const normalizedPath = String(filePath || "").toLowerCase().replace(/\\/g, "/");
  if (/(^|\/)(tests?|__tests__|specs?)\//.test(normalizedPath)) {
    return true;
  }
  const base = (normalizedPath.split("/").pop() || "").replace(/\.[^.]+$/, "");
  return /(^|[._-])(test|spec)([._-]|$)/.test(base) || /[a-z](test|spec)$/.test(base);
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
