export function buildPromptFromBundle(bundle) {
  const sections = [
    "# Atlas Execution Prompt",
    "",
    "You are working on a code change request using Atlas-prepared context.",
    "Follow the constraints below:",
    "- Prefer minimal, reviewable diffs.",
    "- Use the provided files and tests before expanding scope.",
    "- Preserve existing architecture and naming patterns.",
    "- If the context appears insufficient, say what is missing before guessing.",
    "",
    "## Task",
    bundle.task,
    "",
    "## Classification",
    `- Type: ${bundle.classification.taskType}`,
    `- Risk: ${bundle.classification.risk}`,
    `- Context budget: ${bundle.contextBudget}`,
    `- Codex ready: ${bundle.codexReady ? "yes" : "no"}`,
    "",
    "## Summary",
    bundle.summary,
    "",
    "## Likely Files",
    ...formatBulletList(bundle.likelyFiles),
    "",
    "## Related Dependencies",
    ...formatBulletList(bundle.relatedDependencies),
    "",
    "## Selected Tests",
    ...formatBulletList(bundle.selectedTests),
    "",
    "## Call Hints",
    ...formatBulletList(bundle.callHints),
    "",
    "## Validation Strategy",
    `- Mode: ${bundle.validationStrategy.mode}`,
    `- Rationale: ${bundle.validationStrategy.rationale}`,
    ...formatNamedList("Direct tests", bundle.validationStrategy.directTests),
    ...formatNamedList("Expanded tests", bundle.validationStrategy.expandedTests),
    ...formatNamedList("Fallback tests", bundle.validationStrategy.fallbackTests || []),
    "",
    "## File Context"
  ];

  for (const file of bundle.files) {
    sections.push(
      `### ${file.path} (${file.role})`,
      file.summary ? `Summary: ${file.summary}` : "Summary: none",
      file.symbol ? `Relevant symbol: ${file.symbol}` : "Relevant symbol: none",
      "```",
      file.excerpt || "",
      "```",
      ""
    );
  }

  sections.push(
    "## Output Expectations",
    "- Explain the likely root cause briefly.",
    "- Propose the smallest safe code change.",
    "- Reference which selected tests should be run.",
    "- If producing code, prefer a diff-oriented answer."
  );

  return sections.join("\n");
}

function formatBulletList(items) {
  if (!items || items.length === 0) {
    return ["- none"];
  }
  return items.map((item) => `- ${item}`);
}

function formatNamedList(label, items) {
  if (!items || items.length === 0) {
    return [`- ${label}: none`];
  }
  return [`- ${label}: ${items.join(", ")}`];
}
