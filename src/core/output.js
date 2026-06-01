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

  if (value.command === "exec prepare") {
    return formatExecOutput(value);
  }

  if (value.command === "test impacted") {
    return formatTestOutput(value);
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

function formatLines(items) {
  if (!items || items.length === 0) {
    return ["- none"];
  }
  return items.map((item) => `- ${item}`);
}
