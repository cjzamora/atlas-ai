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
      expectedTests: normalizePathList(entry.expectedTests),
      maxEvidenceRank: normalizeOptionalPositiveInteger(entry.maxEvidenceRank),
      maxTestRank: normalizeOptionalPositiveInteger(entry.maxTestRank)
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
  const qualityFailures = results.filter((entry) => !entry.quality.passed).length;

  return {
    cases: results,
    summary: {
      caseCount: results.length,
      limit: safeLimit,
      evidenceHitRate: rate(evidenceHits, results.length),
      testHitRate: rate(testHits, results.length),
      evidenceAverageRank: averageRank(results.map((entry) => entry.evidence.rank)),
      testAverageRank: averageRank(results.map((entry) => entry.tests.rank)),
      rankQualityFailureCount: qualityFailures,
      rankQualityPassed: qualityFailures === 0
    }
  };
}

function evaluateCase(dbFile, entry, limit) {
  const evidence = searchEvidence(dbFile, entry.query, limit);
  const impacted = selectImpactedTests(dbFile, entry.query, limit);
  const topEvidence = evidence.matches.map((match) => match.path);
  const topTests = impacted.tests.map((match) => match.path);
  const evidenceResult = evaluateExpectedPaths(entry.expectedEvidence, topEvidence);
  const testResult = evaluateExpectedPaths(entry.expectedTests, topTests);

  return {
    id: entry.id,
    query: entry.query,
    evidence: evidenceResult,
    tests: {
      ...testResult,
      diagnostics: {
        topMatches: impacted.tests.map((match) => ({
          path: match.path,
          score: match.score,
          covers: match.covers || [],
          coverDetails: match.coverDetails || [],
          scoreBreakdown: match.scoreBreakdown || {}
        }))
      }
    },
    memoryAssistance: summarizeCaseMemoryAssistance(evidence, impacted, topEvidence, topTests),
    quality: evaluateQuality(entry, evidenceResult, testResult)
  };
}

function summarizeCaseMemoryAssistance(evidence, impacted, topEvidence, topTests) {
  const evidenceMemory = evidence.memoryAssistance || {};
  const testMemory = impacted.memoryAssistance || {};
  const boostedPaths = evidenceMemory.boostedPaths || [];
  const boostedTests = testMemory.boostedTests || [];
  const ignoredOutcomes = [
    ...(evidenceMemory.ignoredOutcomes || []),
    ...(testMemory.ignoredOutcomes || [])
  ];

  return {
    matchedPatternCount: Math.max(
      Number(evidenceMemory.matchedPatternCount || 0),
      Number(testMemory.matchedPatternCount || 0)
    ),
    ignoredPatternCount: Math.max(
      Number(evidenceMemory.ignoredPatternCount || 0),
      Number(testMemory.ignoredPatternCount || 0)
    ),
    ignoredOutcomes: [...new Set(ignoredOutcomes)],
    retrievalBoostApplied: Boolean(evidenceMemory.retrievalBoostApplied),
    testBoostApplied: Boolean(testMemory.testBoostApplied),
    boostedPaths,
    boostedTests,
    topEvidenceMemoryBoosted: boostedPaths.includes(topEvidence[0]),
    topTestMemoryBoosted: boostedTests.includes(topTests[0])
  };
}

function evaluateQuality(entry, evidence, tests) {
  const failures = [];

  if (Number.isFinite(entry.maxEvidenceRank) && (!Number.isFinite(evidence.rank) || evidence.rank > entry.maxEvidenceRank)) {
    failures.push({
      type: "maxEvidenceRank",
      expected: entry.maxEvidenceRank,
      actual: evidence.rank
    });
  }

  if (Number.isFinite(entry.maxTestRank) && (!Number.isFinite(tests.rank) || tests.rank > entry.maxTestRank)) {
    failures.push({
      type: "maxTestRank",
      expected: entry.maxTestRank,
      actual: tests.rank
    });
  }

  return {
    passed: failures.length === 0,
    failures
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

function normalizeOptionalPositiveInteger(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(0, Math.floor(parsed));
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
