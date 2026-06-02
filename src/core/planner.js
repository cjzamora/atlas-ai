export function classifyTask(task) {
  const normalized = task.toLowerCase();
  const taskType = normalized.includes("fix")
    ? "bug_fix"
    : normalized.includes("test")
      ? "test_generation"
      : normalized.includes("refactor")
        ? "refactor"
        : normalized.includes("review")
          ? "review"
          : "analysis";

  const risk = /(auth|payment|billing|security|migration|delete|prod)/.test(normalized)
    ? "high"
    : /(refactor|multi|integration|cache|state)/.test(normalized)
      ? "medium"
      : "low";

  return {
    taskType,
    risk,
    requiresTests: taskType !== "analysis",
    contextBudget: risk === "high" ? "medium" : "small",
    modelRecommendation: taskType === "analysis" ? "retrieval-first" : "codex-when-needed"
  };
}

export function buildPlanArtifact(task, classification, matches, impacted = { impactedFiles: [], tests: [] }, priorPatterns = []) {
  const files = matches.slice(0, 5).map((match) => match.path);
  const relatedPaths = [...new Set(matches.flatMap((match) => match.relatedPaths || []))]
    .filter((candidate) => candidate && !files.includes(candidate))
    .slice(0, 5);
  const heuristicTests = [...new Set([
    ...matches.filter((match) => /test|spec/i.test(match.path)).map((match) => match.path),
    ...matches.flatMap((match) => match.testPaths || [])
  ])].slice(0, 5);
  const selectedTests = impacted.tests.map((entry) => entry.path);
  const tests = selectedTests.length > 0 ? selectedTests : heuristicTests;
  const callHints = [...new Set(matches.flatMap((match) => match.callHints || []))].slice(0, 6);

  const steps = [
    "Review the top-ranked implementation files and confirm the active code path.",
    "Inspect adjacent dependencies and exported symbols needed to satisfy the request.",
    "Check existing tests and identify the smallest impacted validation surface."
  ];

  if (classification.taskType !== "analysis") {
    steps.push("Prepare the smallest reviewable diff before expanding scope.");
  }

  if (classification.requiresTests) {
    steps.push("Run targeted tests for the impacted area before broader validation.");
  }

  return {
    summary: `Atlas v0 deterministic plan for: ${task}`,
    likelyFiles: files,
    relatedDependencies: relatedPaths,
    likelyTests: tests,
    selectedTests,
    priorPatterns: priorPatterns.slice(0, 3),
    validationStrategy: buildValidationStrategy(classification, impacted, heuristicTests),
    callHints,
    steps,
    risks: buildRisks(classification, matches, impacted),
    openQuestions: matches.length === 0
      ? ["The repo has no indexed evidence for this request yet."]
      : [],
    codexNeeded: classification.taskType !== "analysis" && files.length > 0
  };
}

function buildValidationStrategy(classification, impacted, heuristicTests) {
  if (!classification.requiresTests) {
    return {
      mode: "none",
      rationale: "This task is analysis-only, so Atlas does not require validation execution yet.",
      directTests: [],
      expandedTests: []
    };
  }

  const selected = impacted.tests.map((entry) => entry.path);
  const directTests = impacted.tests
    .filter((entry) => entry.covers.length === 1)
    .map((entry) => entry.path);
  const expandedTests = selected.filter((testPath) => !directTests.includes(testPath));

  return {
    mode: selected.length > 0 ? "graph" : "heuristic",
    rationale: selected.length > 0
      ? "Atlas selected tests from graph-linked impacted files."
      : "Atlas fell back to heuristic test discovery because no graph-linked tests were selected.",
    directTests,
    expandedTests,
    fallbackTests: selected.length > 0 ? heuristicTests : []
  };
}

function buildRisks(classification, matches, impacted) {
  const risks = [];
  if (classification.risk === "high") {
    risks.push("Request touches a potentially high-impact area and should stay tightly scoped.");
  }
  if (matches.length === 0) {
    risks.push("No evidence was retrieved, so planning confidence is low until the repo is indexed.");
  }
  if (matches.some((match) => /config|schema|migration/i.test(match.path))) {
    risks.push("Retrieved files suggest config or schema coupling that can widen change impact.");
  }
  if (matches.some((match) => (match.relatedPaths || []).length > 0)) {
    risks.push("Dependency-linked files may expand the effective change surface beyond the top direct matches.");
  }
  if (matches.some((match) => (match.testPaths || []).length > 0)) {
    risks.push("Test-linked files should be checked early to keep validation scoped to the impacted area.");
  }
  if (classification.requiresTests && impacted.tests.length === 0) {
    risks.push("No graph-backed impacted tests were selected, so validation may need broader manual coverage.");
  }
  return risks;
}
