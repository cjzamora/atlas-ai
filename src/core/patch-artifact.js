import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export function parsePatchResponse(rawOutput) {
  const raw = String(rawOutput || "");
  const fencedBlocks = extractFencedBlocks(raw);
  const patches = [];

  for (const block of fencedBlocks) {
    const trimmed = block.content.trim();
    if (!trimmed) {
      continue;
    }

    if (isDiffBlock(block.language, trimmed)) {
      patches.push({
        kind: "diff",
        language: block.language || null,
        diff: trimmed
      });
      continue;
    }

    if (isCodeBlock(block.language)) {
      patches.push({
        kind: "code",
        language: block.language || null,
        diff: trimmed
      });
    }
  }

  if (patches.length === 0) {
    const unifiedDiff = extractUnifiedDiff(raw);
    if (unifiedDiff) {
      patches.push({
        kind: "diff",
        language: null,
        diff: unifiedDiff
      });
    }
  }

  return {
    rawOutput: raw,
    parseStatus: getParseStatus(patches),
    patches
  };
}

export async function writePatchArtifact(artifactsDir, artifact) {
  await fs.mkdir(artifactsDir, { recursive: true });
  const file = path.join(artifactsDir, `${artifact.id}.json`);
  await fs.writeFile(file, `${JSON.stringify(artifact, null, 2)}\n`);
  return file;
}

export async function readPatchArtifact(artifactsDir, artifactId) {
  if (!/^patch-[a-zA-Z0-9_-]+$/.test(artifactId)) {
    throw new Error(`Invalid patch artifact id: ${artifactId}`);
  }

  const file = path.join(artifactsDir, `${artifactId}.json`);
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Patch artifact not found: ${artifactId}`);
    }
    throw error;
  }
}

export async function updatePatchArtifact(artifactsDir, artifactId, updater) {
  const current = await readPatchArtifact(artifactsDir, artifactId);
  const updated = typeof updater === "function"
    ? await updater(structuredClone(current))
    : { ...current, ...updater };

  await writePatchArtifact(artifactsDir, updated);
  return updated;
}

export function buildPatchArtifact({
  task,
  request,
  response,
  usage,
  provider,
  model
}) {
  const rawOutput = response?.text || response?.outputText || "";
  const parsed = parsePatchResponse(rawOutput);
  const id = createPatchId({ task, rawOutput, requestId: request?.requestId });

  return {
    id,
    type: "patch",
    reviewOnly: true,
    task,
    provider,
    model,
    requestId: request?.requestId || null,
    responseId: response?.id || response?.responseId || null,
    status: "staged",
    createdAt: new Date().toISOString(),
    parseStatus: parsed.parseStatus,
    patches: parsed.patches,
    rawOutput: parsed.rawOutput,
    usage: usage || null,
    selectedTests: request?.selectedTests || [],
    memoryHints: request?.memoryHints || [],
    memoryAssistance: request?.memoryAssistance || {
      matchedPatternCount: 0,
      retrievalBoostApplied: false,
      testBoostApplied: false,
      boostedPaths: [],
      boostedTests: []
    },
    files: request?.files || [],
    validation: null,
    postApplyValidation: null,
    appliedAt: null,
    appliedFiles: [],
    confirmedAt: null,
    fileSnapshots: [],
    rolledBackAt: null,
    rolledBackFiles: []
  };
}

function extractFencedBlocks(raw) {
  const blocks = [];
  const fencePattern = /```([^\n`]*)\n([\s\S]*?)```/g;
  let match;
  while ((match = fencePattern.exec(raw)) !== null) {
    blocks.push({
      language: match[1].trim().toLowerCase(),
      content: match[2]
    });
  }
  return blocks;
}

function extractUnifiedDiff(raw) {
  const lines = raw.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => isDiffStart(line));
  if (startIndex === -1) {
    return null;
  }

  return lines.slice(startIndex).join("\n").trim();
}

function isDiffBlock(language, content) {
  return ["diff", "patch", "udiff"].includes(language) || /^diff --git /m.test(content) || /^---\s+/m.test(content) && /^\+\+\+\s+/m.test(content);
}

function isCodeBlock(language) {
  if (!language) {
    return true;
  }
  return !["text", "txt", "markdown", "md"].includes(language);
}

function isDiffStart(line) {
  return line.startsWith("diff --git ") || line.startsWith("--- ");
}

function getParseStatus(patches) {
  if (patches.some((patch) => patch.kind === "diff")) {
    return patches.every((patch) => patch.kind === "diff") ? "parsed" : "partial";
  }

  if (patches.length > 0) {
    return "partial";
  }

  return "unstructured";
}

function createPatchId({ task, rawOutput, requestId }) {
  return `patch-${crypto
    .createHash("sha1")
    .update(`${requestId || ""}:${task || ""}:${rawOutput || ""}:${Date.now()}`)
    .digest("hex")
    .slice(0, 12)}`;
}
