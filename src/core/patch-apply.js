import fs from "node:fs/promises";
import path from "node:path";

export async function applyPatchArtifactToRepo({ rootDir, artifact }) {
  if (!artifact?.validation || artifact.validation.status !== "passed") {
    throw new Error("Patch artifact must pass validation before apply.");
  }

  const diffPatches = (artifact.patches || []).filter((patch) => patch.kind === "diff" && patch.diff);
  if (diffPatches.length === 0) {
    throw new Error("Patch artifact does not contain any applicable unified diffs.");
  }

  const filePatches = diffPatches.flatMap((patch) => parseUnifiedDiff(patch.diff));
  if (filePatches.length === 0) {
    throw new Error("Patch artifact does not contain any parsable file diffs.");
  }

  const changedFiles = [];
  const fileSnapshots = [];
  for (const filePatch of filePatches) {
    const relativePath = getApplyTargetPath(filePatch);
    const absolutePath = path.join(rootDir, relativePath);
    const before = await fs.readFile(absolutePath, "utf8");
    const nextContent = buildPatchedContent(before, absolutePath, filePatch);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, nextContent);
    changedFiles.push(relativePath);
    fileSnapshots.push({
      path: relativePath,
      before,
      after: nextContent
    });
  }

  return {
    changedFiles: [...new Set(changedFiles)],
    fileSnapshots
  };
}

export async function rollbackPatchArtifact({ rootDir, artifact }) {
  if (!["applied", "apply_failed_validation"].includes(artifact?.status)) {
    throw new Error("Patch artifact must be applied or failed validation before rollback.");
  }

  const fileSnapshots = artifact.fileSnapshots || [];
  if (fileSnapshots.length === 0) {
    throw new Error("Patch artifact does not contain any restorable file snapshots.");
  }

  const changedFiles = [];
  for (const snapshot of fileSnapshots) {
    const absolutePath = path.join(rootDir, snapshot.path);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, snapshot.before);
    changedFiles.push(snapshot.path);
  }

  return {
    changedFiles: [...new Set(changedFiles)]
  };
}

function parseUnifiedDiff(diffText) {
  const lines = String(diffText || "").split(/\r?\n/);
  const filePatches = [];
  let current = null;
  let currentHunk = null;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (current) {
        if (currentHunk) {
          current.hunks.push(currentHunk);
          currentHunk = null;
        }
        filePatches.push(current);
      }
      current = {
        oldPath: null,
        newPath: null,
        hunks: []
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith("--- ")) {
      current.oldPath = normalizeDiffPath(line.slice(4).trim());
      continue;
    }

    if (line.startsWith("+++ ")) {
      current.newPath = normalizeDiffPath(line.slice(4).trim());
      continue;
    }

    if (line.startsWith("@@ ")) {
      if (currentHunk) {
        current.hunks.push(currentHunk);
      }
      currentHunk = createHunk(line);
      continue;
    }

    if (!currentHunk) {
      continue;
    }

    if (line.startsWith("\\ No newline at end of file")) {
      continue;
    }

    const marker = line[0];
    if (marker === " " || marker === "+" || marker === "-") {
      currentHunk.lines.push({
        type: marker,
        text: line.slice(1)
      });
    }
  }

  if (current) {
    if (currentHunk) {
      current.hunks.push(currentHunk);
    }
    filePatches.push(current);
  }

  return filePatches.filter((entry) => entry.hunks.length > 0);
}

function createHunk(headerLine) {
  const match = headerLine.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
  if (!match) {
    throw new Error(`Unsupported diff hunk header: ${headerLine}`);
  }

  return {
    oldStart: Number(match[1]),
    oldCount: Number(match[2] || 1),
    newStart: Number(match[3]),
    newCount: Number(match[4] || 1),
    lines: []
  };
}

function normalizeDiffPath(rawPath) {
  if (rawPath === "/dev/null") {
    return rawPath;
  }
  return rawPath.replace(/^[ab]\//, "");
}

function getApplyTargetPath(filePatch) {
  const relativePath = filePatch.newPath && filePatch.newPath !== "/dev/null"
    ? filePatch.newPath
    : filePatch.oldPath;

  if (!relativePath || relativePath === "/dev/null") {
    throw new Error("Creating or deleting files is not supported by Atlas v0 patch apply.");
  }

  return relativePath;
}

function buildPatchedContent(originalContent, absolutePath, filePatch) {
  const originalEndsWithNewline = originalContent.endsWith("\n");
  const sourceLines = originalContent.split("\n");
  if (originalEndsWithNewline) {
    sourceLines.pop();
  }

  let cursor = 0;
  const output = [];

  for (const hunk of filePatch.hunks) {
    const targetIndex = Math.max(0, hunk.oldStart - 1);
    while (cursor < targetIndex) {
      output.push(sourceLines[cursor]);
      cursor += 1;
    }

    for (const line of hunk.lines) {
      if (line.type === " ") {
        assertSourceLine(sourceLines, cursor, line.text, absolutePath);
        output.push(sourceLines[cursor]);
        cursor += 1;
        continue;
      }

      if (line.type === "-") {
        assertSourceLine(sourceLines, cursor, line.text, absolutePath);
        cursor += 1;
        continue;
      }

      if (line.type === "+") {
        output.push(line.text);
      }
    }
  }

  while (cursor < sourceLines.length) {
    output.push(sourceLines[cursor]);
    cursor += 1;
  }

  const content = output.join("\n");
  return originalEndsWithNewline ? `${content}\n` : content;
}

function assertSourceLine(sourceLines, index, expected, absolutePath) {
  const actual = sourceLines[index];
  if (actual !== expected) {
    throw new Error(
      `Patch apply context mismatch in ${absolutePath} at line ${index + 1}. Expected "${expected}" but found "${actual ?? "<eof>"}".`
    );
  }
}
