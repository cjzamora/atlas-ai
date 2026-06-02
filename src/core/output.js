export function formatOutput(value, jsonMode) {
  if (jsonMode) {
    return JSON.stringify(value, null, 2);
  }

  return formatHuman(value);
}

function formatHuman(value) {
  if (!value || typeof value !== "object") {
    return String(value);
  }

  if (value.command === "ask") {
    return formatAskOutput(value);
  }

  if (value.command === "plan") {
    return formatPlanOutput(value);
  }

  if (value.command === "context") {
    return formatContextOutput(value);
  }

  if (value.command === "prompt") {
    return formatPromptOutput(value);
  }

  if (value.command === "fix") {
    return formatFixOutput(value);
  }

  if (value.command === "exec prepare") {
    return formatExecOutput(value);
  }

  if (value.command === "exec run") {
    return formatExecRunOutput(value);
  }

  if (value.command === "patch stage") {
    return formatPatchStageOutput(value);
  }

  if (value.command === "patch show") {
    return formatPatchShowOutput(value);
  }

  if (value.command === "patch apply") {
    return formatPatchApplyOutput(value);
  }

  if (value.command === "patch confirm") {
    return formatPatchConfirmOutput(value);
  }

  if (value.command === "patch rollback") {
    return formatPatchRollbackOutput(value);
  }

  if (value.command === "test impacted") {
    return formatTestOutput(value);
  }

  if (value.command === "test run") {
    return formatTestRunOutput(value);
  }

  const lines = [];
  for (const [key, entry] of Object.entries(value)) {
    lines.push(`${key}: ${formatEntry(entry)}`);
  }
  return lines.join("\n");
}

function formatEntry(entry) {
  if (Array.isArray(entry) || (entry && typeof entry === "object")) {
    return JSON.stringify(entry, null, 2);
  }
  return String(entry);
}

function formatAskOutput(value) {
  const lines = [
    `Query: ${value.query}`,
    `Answer: ${value.answer}`
  ];

  if (value.evidence?.length) {
    lines.push("", "Evidence:");
    for (const entry of value.evidence) {
      lines.push(`- ${entry.path}${entry.symbol ? ` (${entry.symbol})` : ""}`);
    }
  }

  return lines.join("\n");
}

function formatPlanOutput(value) {
  const plan = value.plan || {};
  const lines = [
    `Task: ${value.task}`,
    `Type: ${value.classification?.taskType || "unknown"}`,
    `Risk: ${value.classification?.risk || "unknown"}`,
    "",
    "Likely files:",
    ...formatLines(plan.likelyFiles),
    "",
    "Selected tests:",
    ...formatLines(plan.selectedTests),
    "",
    "Validation:",
    `- Mode: ${plan.validationStrategy?.mode || "unknown"}`,
    `- Direct tests: ${(plan.validationStrategy?.directTests || []).join(", ") || "none"}`,
    "",
    "Steps:",
    ...formatLines(plan.steps)
  ];
  return lines.join("\n");
}

function formatContextOutput(value) {
  const bundle = value.bundle || {};
  const lines = [
    `Task: ${value.task}`,
    `Summary: ${bundle.summary || "none"}`,
    "",
    "Primary files:",
    ...formatLines(bundle.likelyFiles),
    "",
    "Selected tests:",
    ...formatLines(bundle.selectedTests),
    "",
    "Bundle files:"
  ];

  for (const file of bundle.files || []) {
    lines.push(`- ${file.path} [${file.role}]`);
  }

  return lines.join("\n");
}

function formatPromptOutput(value) {
  return value.prompt || "";
}

function formatFixOutput(value) {
  const lines = [
    `Task: ${value.task}`,
    `Status: ${value.status || "unknown"}`,
    `Artifact: ${value.artifactId || value.artifact?.id || "unknown"}`
  ];

  if (value.stage) {
    lines.push(`Stage: ${value.stage.status || "unknown"}`);
  }
  if (value.validation) {
    lines.push(`Validation: ${value.validation.status || "unknown"}`);
  }
  if (value.apply) {
    lines.push(`Apply: ${value.apply.status || "unknown"}`);
    lines.push("", "Changed files:", ...formatLines(value.apply.changedFiles));
  }
  if (value.rollback) {
    lines.push(`Rollback: ${value.rollback.status || "unknown"}`);
  }
  if (value.metrics) {
    lines.push(
      "",
      "Metrics:",
      `- Total tokens: ${value.metrics.totalTokens ?? 0}`,
      `- Stage tokens: ${value.metrics.stageTokens ?? 0}`,
      `- Apply tokens: ${value.metrics.applyTokens ?? 0}`,
      `- Selected tests: ${value.metrics.selectedTests ?? 0}`
    );
  }

  if (!value.ok && value.stage?.error?.message) {
    lines.push("", `Error: ${value.stage.error.message}`);
  }

  return lines.join("\n");
}

function formatExecOutput(value) {
  const request = value.request || {};
  const lines = [
    `Task: ${value.task}`,
    `Provider: ${request.provider || "unknown"}`,
    `Model: ${request.model || "unknown"}`,
    `Request ID: ${request.requestId || "unknown"}`,
    "",
    "Selected tests:",
    ...formatLines(request.selectedTests),
    "",
    "Files:",
    ...formatLines((request.files || []).map((file) => `${file.path} [${file.role}]`)),
    "",
    "Prompt preview:",
    (request.prompt || "").slice(0, 600) + ((request.prompt || "").length > 600 ? "\n..." : "")
  ];
  return lines.join("\n");
}

function formatExecRunOutput(value) {
  const request = value.request || {};
  const response = value.response || {};
  const usage = value.usage || {};
  const lines = [
    `Task: ${value.task}`,
    `Provider: ${request.provider || "unknown"}`,
    `Model: ${request.model || "unknown"}`,
    `Request ID: ${request.requestId || "unknown"}`,
    `Status: ${value.status || "unknown"}`,
    "",
    "Selected tests:",
    ...formatLines(request.selectedTests),
    ""
  ];

  if (value.error) {
    lines.push(`Error: ${value.error.message}`);
  } else {
    lines.push(
      "Usage:",
      `- Input tokens: ${usage.inputTokens ?? "unknown"}`,
      `- Output tokens: ${usage.outputTokens ?? "unknown"}`,
      `- Total tokens: ${usage.totalTokens ?? "unknown"}`,
      "",
      "Response preview:",
      (response.outputText || "").slice(0, 800) + ((response.outputText || "").length > 800 ? "\n..." : "")
    );
  }

  return lines.join("\n");
}

function formatPatchStageOutput(value) {
  const artifact = value.artifact || {};
  const request = value.request || {};
  const lines = [
    `Task: ${value.task}`,
    `Provider: ${request.provider || "unknown"}`,
    `Model: ${request.model || "unknown"}`,
    `Request ID: ${request.requestId || "unknown"}`,
    `Status: ${value.status || "unknown"}`,
    `Artifact: ${value.artifactId || "none"}`,
    `Review only: ${artifact.reviewOnly === true ? "yes" : "unknown"}`,
    `Parse status: ${artifact.parseStatus || "unknown"}`,
    "",
    "Patch blocks:",
    ...formatLines((artifact.patches || []).map((patch, index) => `${index + 1}. ${patch.kind}${patch.language ? ` (${patch.language})` : ""}`))
  ];

  if (value.error) {
    lines.push("", `Error: ${value.error.message}`);
  } else {
    lines.push(
      "",
      "Raw output preview:",
      (artifact.rawOutput || "").slice(0, 800) + ((artifact.rawOutput || "").length > 800 ? "\n..." : "")
    );
  }

  return lines.join("\n");
}

function formatPatchShowOutput(value) {
  const artifact = value.artifact || {};
  const lines = [
    `Artifact: ${artifact.id || value.artifactId || "unknown"}`,
    `Task: ${artifact.task || "unknown"}`,
    `Status: ${artifact.status || "unknown"}`,
    `Review only: ${artifact.reviewOnly === true ? "yes" : "unknown"}`,
    `Parse status: ${artifact.parseStatus || "unknown"}`,
    "",
    "Patch blocks:",
    ...formatLines((artifact.patches || []).map((patch, index) => `${index + 1}. ${patch.kind}${patch.language ? ` (${patch.language})` : ""}`))
  ];

  if (artifact.validation) {
    lines.push(
      "",
      "Validation:",
      `- Status: ${artifact.validation.status || "unknown"}`,
      `- Passed: ${artifact.validation.summary?.passed ?? 0}`,
      `- Failed: ${artifact.validation.summary?.failed ?? 0}`,
      `- Skipped: ${artifact.validation.summary?.skipped ?? 0}`
    );
  }

  if (artifact.postApplyValidation) {
    lines.push(
      "",
      "Post-apply validation:",
      `- Status: ${artifact.postApplyValidation.status || "unknown"}`,
      `- Passed: ${artifact.postApplyValidation.summary?.passed ?? 0}`,
      `- Failed: ${artifact.postApplyValidation.summary?.failed ?? 0}`,
      `- Skipped: ${artifact.postApplyValidation.summary?.skipped ?? 0}`
    );
  }

  if (artifact.appliedAt || (artifact.appliedFiles || []).length > 0) {
    lines.push(
      "",
      "Applied:",
      `- At: ${artifact.appliedAt || "unknown"}`,
      ...formatLines(artifact.appliedFiles)
    );
  }

  if (artifact.rolledBackAt || (artifact.rolledBackFiles || []).length > 0) {
    lines.push(
      "",
      "Rolled back:",
      `- At: ${artifact.rolledBackAt || "unknown"}`,
      ...formatLines(artifact.rolledBackFiles)
    );
  }

  lines.push("", "Raw output:", artifact.rawOutput || "");
  return lines.join("\n");
}

function formatPatchApplyOutput(value) {
  return [
    `Artifact: ${value.artifactId || "unknown"}`,
    `Task: ${value.task || "unknown"}`,
    `Status: ${value.status || "unknown"}`,
    "",
    "Changed files:",
    ...formatLines(value.changedFiles)
  ].join("\n");
}

function formatPatchConfirmOutput(value) {
  return [
    `Artifact: ${value.artifactId || "unknown"}`,
    `Task: ${value.task || "unknown"}`,
    `Status: ${value.status || "unknown"}`,
    "",
    "Post-apply validation:",
    `- Passed: ${value.postApplyValidation?.summary?.passed ?? 0}`,
    `- Failed: ${value.postApplyValidation?.summary?.failed ?? 0}`,
    `- Skipped: ${value.postApplyValidation?.summary?.skipped ?? 0}`
  ].join("\n");
}

function formatPatchRollbackOutput(value) {
  return [
    `Artifact: ${value.artifactId || "unknown"}`,
    `Task: ${value.task || "unknown"}`,
    `Status: ${value.status || "unknown"}`,
    "",
    "Rolled back files:",
    ...formatLines(value.changedFiles)
  ].join("\n");
}

function formatTestOutput(value) {
  const lines = [
    `Query: ${value.query}`,
    "Impacted files:",
    ...formatLines(value.impactedFiles)
  ];

  lines.push("", "Selected tests:");
  for (const test of value.tests || []) {
    lines.push(`- ${test.path} (covers: ${test.covers.join(", ")})`);
  }

  if (value.message) {
    lines.push("", value.message);
  }

  return lines.join("\n");
}

function formatTestRunOutput(value) {
  const lines = [
    `Artifact: ${value.artifactId || "unknown"}`,
    `Task: ${value.task || "unknown"}`,
    `Status: ${value.status || "unknown"}`,
    "",
    "Summary:",
    `- Passed: ${value.summary?.passed ?? 0}`,
    `- Failed: ${value.summary?.failed ?? 0}`,
    `- Skipped: ${value.summary?.skipped ?? 0}`,
    "",
    "Results:"
  ];

  for (const result of value.results || []) {
    lines.push(`- ${result.path}: ${result.status} (${result.runner || "unknown"})`);
    for (const testCase of result.cases || []) {
      lines.push(`  - ${testCase.name}: ${testCase.status}`);
    }
    if (result.error?.message) {
      lines.push(`  - Error: ${result.error.message}`);
    }
  }

  return lines.join("\n");
}

function formatLines(items) {
  if (!items || items.length === 0) {
    return ["- none"];
  }
  return items.map((item) => `- ${item}`);
}
