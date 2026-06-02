import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SUPPORTED_SOURCE_EXTENSIONS = [".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"];
const CONTROL_KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "with", "constructor"]);

export async function runSelectedTests({ rootDir, selectedTests }) {
  const startedAt = new Date().toISOString();

  if (!selectedTests || selectedTests.length === 0) {
    const finishedAt = new Date().toISOString();
    return {
      status: "skipped",
      startedAt,
      finishedAt,
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0
      },
      results: []
    };
  }

  const executableRoot = await buildExecutableWorkspace(rootDir);
  try {
    const results = [];
    for (const selectedTest of selectedTests) {
      results.push(await executeSelectedTest(executableRoot, selectedTest));
    }

    const summary = summarizeResults(results);
    const finishedAt = new Date().toISOString();
    return {
      status: summary.failed > 0 ? "failed" : summary.passed > 0 ? "passed" : "skipped",
      startedAt,
      finishedAt,
      summary,
      results
    };
  } finally {
    await fs.rm(executableRoot, { recursive: true, force: true });
  }
}

async function buildExecutableWorkspace(rootDir) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-validation-workspace-"));
  const files = await collectSourceFiles(rootDir);
  const outputRelativePaths = new Map();

  for (const file of files) {
    outputRelativePaths.set(file.relativePath, toExecutableRelativePath(file.relativePath));
  }

  await fs.writeFile(
    path.join(tempRoot, "package.json"),
    JSON.stringify({ type: "module", private: true }, null, 2)
  );

  for (const file of files) {
    const outputRelativePath = outputRelativePaths.get(file.relativePath);
    const outputPath = path.join(tempRoot, outputRelativePath);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const source = await fs.readFile(file.absolutePath, "utf8");
    const transformed = transformModuleSource({
      source,
      relativePath: file.relativePath,
      sourceExtension: file.extension,
      outputRelativePaths,
      rootDir
    });

    await fs.writeFile(outputPath, transformed);
  }

  return tempRoot;
}

async function executeSelectedTest(executableRoot, selectedTest) {
  const startedAt = Date.now();
  const executableRelativePath = toExecutableRelativePath(selectedTest);
  const modulePath = path.join(executableRoot, executableRelativePath);

  try {
    const module = await import(`${pathToFileURL(modulePath).href}?t=${Date.now()}`);
    const exportedEntries = Object.entries(module).filter(([, value]) => typeof value === "function");
    const runnableEntries = exportedEntries.filter(([name]) => /(?:^test|TestCase$)/.test(name));

    if (runnableEntries.length === 0) {
      return {
        path: selectedTest,
        runner: "module-probe",
        status: "skipped",
        durationMs: Date.now() - startedAt,
        cases: [],
        error: {
          message: "No runnable exported test functions were found."
        }
      };
    }

    const cases = [];
    for (const [name, fn] of runnableEntries) {
      const caseStartedAt = Date.now();
      try {
        await fn();
        cases.push({
          name,
          status: "passed",
          durationMs: Date.now() - caseStartedAt
        });
      } catch (error) {
        cases.push({
          name,
          status: "failed",
          durationMs: Date.now() - caseStartedAt,
          error: serializeError(error)
        });
      }
    }

    const failedCase = cases.find((entry) => entry.status === "failed");
    return {
      path: selectedTest,
      runner: "module-probe",
      status: failedCase ? "failed" : "passed",
      durationMs: Date.now() - startedAt,
      cases,
      error: failedCase?.error || null
    };
  } catch (error) {
    return {
      path: selectedTest,
      runner: "module-probe",
      status: "failed",
      durationMs: Date.now() - startedAt,
      cases: [],
      error: serializeError(error)
    };
  }
}

function summarizeResults(results) {
  return results.reduce(
    (summary, result) => {
      summary.total += 1;
      if (result.status === "passed") {
        summary.passed += 1;
      } else if (result.status === "failed") {
        summary.failed += 1;
      } else {
        summary.skipped += 1;
      }
      return summary;
    },
    {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0
    }
  );
}

async function collectSourceFiles(rootDir) {
  const files = [];
  await walkDirectory(rootDir, "", files);
  return files;
}

async function walkDirectory(rootDir, relativeDir, files) {
  const directoryPath = path.join(rootDir, relativeDir);
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === ".atlas" || entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }

    const relativePath = relativeDir ? path.join(relativeDir, entry.name) : entry.name;
    if (entry.isDirectory()) {
      await walkDirectory(rootDir, relativePath, files);
      continue;
    }

    const extension = path.extname(entry.name);
    if (!SUPPORTED_SOURCE_EXTENSIONS.includes(extension)) {
      continue;
    }

    files.push({
      absolutePath: path.join(rootDir, relativePath),
      relativePath,
      extension
    });
  }
}

function transformModuleSource({ source, relativePath, sourceExtension, outputRelativePaths, rootDir }) {
  let transformed = rewriteRelativeImports(source, relativePath, outputRelativePaths, rootDir);

  if (sourceExtension === ".ts" || sourceExtension === ".tsx") {
    transformed = transformTypeExports(transformed);
    transformed = transformConstructors(transformed);
    transformed = transformFunctionLikeSignatures(transformed);
  }

  return transformed;
}

function rewriteRelativeImports(source, relativePath, outputRelativePaths, rootDir) {
  const replaceSpecifier = (specifier) => {
    if (!specifier.startsWith(".")) {
      return specifier;
    }

    const resolvedRelativePath = resolveImportRelativePath(relativePath, specifier, rootDir);
    if (!resolvedRelativePath) {
      return specifier;
    }

    const outputRelativePath = outputRelativePaths.get(resolvedRelativePath);
    if (!outputRelativePath) {
      return specifier;
    }

    let rewritten = path.relative(
      path.dirname(toExecutableRelativePath(relativePath)),
      outputRelativePath
    );

    rewritten = rewritten.split(path.sep).join("/");
    if (!rewritten.startsWith(".")) {
      rewritten = `./${rewritten}`;
    }

    return rewritten;
  };

  let rewritten = source.replace(/(from\s+["'])([^"']+)(["'])/g, (match, prefix, specifier, suffix) => {
    return `${prefix}${replaceSpecifier(specifier)}${suffix}`;
  });

  rewritten = rewritten.replace(/(import\s+["'])([^"']+)(["'])/g, (match, prefix, specifier, suffix) => {
    return `${prefix}${replaceSpecifier(specifier)}${suffix}`;
  });

  return rewritten;
}

function resolveImportRelativePath(importerRelativePath, specifier, rootDir) {
  const importerDirectory = path.dirname(path.join(rootDir, importerRelativePath));
  const resolvedBasePath = path.resolve(importerDirectory, specifier);
  const candidates = [];

  const explicitExtension = path.extname(specifier);
  if (explicitExtension && SUPPORTED_SOURCE_EXTENSIONS.includes(explicitExtension)) {
    candidates.push(resolvedBasePath);
  } else {
    for (const extension of SUPPORTED_SOURCE_EXTENSIONS) {
      candidates.push(`${resolvedBasePath}${extension}`);
      candidates.push(path.join(resolvedBasePath, `index${extension}`));
    }
  }

  for (const candidate of candidates) {
    if (looksLikeExistingSourcePath(candidate, rootDir)) {
      return path.relative(rootDir, candidate);
    }
  }

  return null;
}

function looksLikeExistingSourcePath(candidate, rootDir) {
  try {
    const relative = path.relative(rootDir, candidate);
    if (relative.startsWith("..")) {
      return false;
    }
    return SUPPORTED_SOURCE_EXTENSIONS.includes(path.extname(candidate)) && fsSync.existsSync(candidate);
  } catch {
    return false;
  }
}

function transformTypeExports(source) {
  let transformed = source.replace(
    /export\s+type\s+([A-Za-z0-9_]+)\s*=\s*{[\s\S]*?};/g,
    "export const $1 = undefined;"
  );

  transformed = transformed.replace(
    /(^|\n)\s*type\s+([A-Za-z0-9_]+)\s*=\s*{[\s\S]*?};/g,
    "$1const $2 = undefined;"
  );

  return transformed;
}

function transformConstructors(source) {
  return source.replace(/constructor\s*\(([\s\S]*?)\)\s*\{([\s\S]*?)\}/g, (match, rawParams, body) => {
    const transformed = transformParameterList(rawParams);
    const assignmentBlock = transformed.assignments.length > 0
      ? `${transformed.assignments.map((entry) => `this.${entry} = ${entry};`).join("\n")}\n`
      : "";
    const normalizedBody = body.trim();
    const bodyBlock = normalizedBody ? `${assignmentBlock}${normalizedBody}\n` : assignmentBlock;
    return `constructor(${transformed.params}) {\n${indentBlock(bodyBlock)}\n}`;
  });
}

function transformFunctionLikeSignatures(source) {
  return source.replace(
    /((?:export\s+)?(?:async\s+)?function\s+[A-Za-z0-9_]+|[A-Za-z0-9_]+)\s*\(([\s\S]*?)\)\s*(?::\s*[\s\S]*?)?\s*\{/g,
    (match, head, rawParams) => {
      const identifier = head.trim().split(/\s+/).pop();
      if (CONTROL_KEYWORDS.has(identifier)) {
        return match;
      }
      const transformed = transformParameterList(rawParams);
      return `${head}(${transformed.params}) {`;
    }
  );
}

function transformParameterList(rawParams) {
  const params = splitTopLevel(rawParams, ",");
  const transformedParams = [];
  const assignments = [];

  for (const rawParam of params) {
    const trimmed = rawParam.trim();
    if (!trimmed) {
      continue;
    }

    const transformed = transformSingleParameter(trimmed);
    transformedParams.push(transformed.code);
    if (transformed.assignToThis) {
      assignments.push(transformed.assignToThis);
    }
  }

  return {
    params: transformedParams.join(", "),
    assignments
  };
}

function transformSingleParameter(rawParam) {
  let param = rawParam;
  let restPrefix = "";
  let assignToThis = null;

  if (param.startsWith("...")) {
    restPrefix = "...";
    param = param.slice(3).trim();
  }

  const modifierMatch = param.match(/^(public|private|protected)\s+(readonly\s+)?/);
  if (modifierMatch) {
    param = param.slice(modifierMatch[0].length).trim();
  }

  const defaultIndex = findTopLevelCharacter(param, "=");
  const beforeDefault = defaultIndex === -1 ? param : param.slice(0, defaultIndex).trim();
  const defaultValue = defaultIndex === -1 ? "" : param.slice(defaultIndex + 1).trim();

  const colonIndex = findTopLevelCharacter(beforeDefault, ":");
  let namePart = colonIndex === -1 ? beforeDefault : beforeDefault.slice(0, colonIndex).trim();
  namePart = namePart.replace(/\?/g, "").trim();

  if (modifierMatch) {
    assignToThis = namePart;
  }

  return {
    code: `${restPrefix}${namePart}${defaultValue ? ` = ${defaultValue}` : ""}`,
    assignToThis
  };
}

function splitTopLevel(value, delimiter) {
  const parts = [];
  let current = "";
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "(") {
      depthParen += 1;
    } else if (character === ")") {
      depthParen = Math.max(0, depthParen - 1);
    } else if (character === "{") {
      depthBrace += 1;
    } else if (character === "}") {
      depthBrace = Math.max(0, depthBrace - 1);
    } else if (character === "[") {
      depthBracket += 1;
    } else if (character === "]") {
      depthBracket = Math.max(0, depthBracket - 1);
    }

    if (
      character === delimiter &&
      depthParen === 0 &&
      depthBrace === 0 &&
      depthBracket === 0
    ) {
      parts.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

function findTopLevelCharacter(value, target) {
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "(") {
      depthParen += 1;
    } else if (character === ")") {
      depthParen = Math.max(0, depthParen - 1);
    } else if (character === "{") {
      depthBrace += 1;
    } else if (character === "}") {
      depthBrace = Math.max(0, depthBrace - 1);
    } else if (character === "[") {
      depthBracket += 1;
    } else if (character === "]") {
      depthBracket = Math.max(0, depthBracket - 1);
    } else if (
      character === target &&
      depthParen === 0 &&
      depthBrace === 0 &&
      depthBracket === 0
    ) {
      return index;
    }
  }

  return -1;
}

function indentBlock(value) {
  return String(value || "")
    .split("\n")
    .filter((line, index, array) => !(index === array.length - 1 && line === ""))
    .map((line) => `  ${line}`)
    .join("\n");
}

function toExecutableRelativePath(relativePath) {
  const parsed = path.parse(relativePath);
  return path.join(parsed.dir, `${parsed.name}.js`);
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack || null
    };
  }

  return {
    name: "Error",
    message: String(error),
    stack: null
  };
}
