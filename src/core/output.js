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
