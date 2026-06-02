import fs from "node:fs/promises";
import { searchEvidence } from "./retrieval.js";
import { selectImpactedTests } from "../validation/test-selection.js";

export async function loadRetrievalEvalSpec(specFile) {
  const raw = await fs.readFile(specFile, "utf8");
  const parsed = JSON.parse(raw);
  const cases = Array.isArray(parsed.cases) ? parsed.cases : [];

  return {
    limit: Math.max(1, Number(parsed.limit || 5)),
    cases: cases.map((entry, index) => ({
      id: entry.id || `case-${index + 1}`,
      query: String(entry.query || "").trim(),
      expectedEvidence: normalizePathList(entry.expectedEvidence),
      expectedTests: normalizePathList(entry.expectedTests)
    })).filter((entry) => entry.query.length > 0)
  };
}

export async function writeRetrievalEvalReport(reportFile, report) {
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
}

export function evaluateRetrievalSpec(dbFile, spec) {
  const safeLimit = Math.max(1, Number(spec.limit || 5));
  const results = spec.cases.map((entry) => evaluateCase(dbFile, entry, safeLimit));

  const evidenceHits = results.filter((entry) => entry.evidence.hit).length;
  const testHits = results.filter((entry) => entry.tests.hit).length;

  return {
    cases: results,
    summary: {
      caseCount: results.length,
      limit: safeLimit,
      evidenceHitRate: rate(evidenceHits, results.length),
      testHitRate: rate(testHits, results.length),
      evidenceAverageRank: averageRank(results.map((entry) => entry.evidence.rank)),
      testAverageRank: averageRank(results.map((entry) => entry.tests.rank))
    }
  };
}

function evaluateCase(dbFile, entry, limit) {
  const evidence = searchEvidence(dbFile, entry.query, limit);
  const impacted = selectImpactedTests(dbFile, entry.query, limit);
  const topEvidence = evidence.matches.map((match) => match.path);
  const topTests = impacted.tests.map((match) => match.path);

  return {
    id: entry.id,
    query: entry.query,
    evidence: evaluateExpectedPaths(entry.expectedEvidence, topEvidence),
    tests: evaluateExpectedPaths(entry.expectedTests, topTests)
  };
}

function evaluateExpectedPaths(expectedPaths, actualPaths) {
  const normalizedExpected = normalizePathList(expectedPaths);
  const normalizedActual = normalizePathList(actualPaths);
  const rank = findFirstRank(normalizedExpected, normalizedActual);

  return {
    expected: normalizedExpected,
    topMatches: normalizedActual,
    hit: rank !== null,
    rank
  };
}

function findFirstRank(expectedPaths, actualPaths) {
  if (expectedPaths.length === 0 || actualPaths.length === 0) {
    return null;
  }

  let bestRank = null;
  for (const expectedPath of expectedPaths) {
    const index = actualPaths.indexOf(expectedPath);
    if (index === -1) {
      continue;
    }
    const rank = index + 1;
    if (bestRank === null || rank < bestRank) {
      bestRank = rank;
    }
  }

  return bestRank;
}

function normalizePathList(paths) {
  return Array.isArray(paths)
    ? paths.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];
}

function rate(numerator, denominator) {
  if (!denominator) {
    return 0;
  }
  return numerator / denominator;
}

function averageRank(ranks) {
  const present = ranks.filter((rank) => Number.isFinite(rank));
  if (present.length === 0) {
    return null;
  }

  return present.reduce((sum, rank) => sum + rank, 0) / present.length;
}
