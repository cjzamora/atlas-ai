import { ensureAtlasRuntime } from "../core/runtime.js";
import { createRunLogger } from "../core/run-log.js";
import { getIndexSnapshot, upsertFiles, upsertRunSummaries } from "../core/store.js";
import { scanRepository } from "../core/scanner.js";

export async function indexCommand({ flags }) {
  const runtime = await ensureAtlasRuntime(flags.root);
  const previousIndex = getIndexSnapshot(runtime.paths.dbFile);
  const scan = await scanRepository(runtime.rootDir);
  upsertFiles(runtime.paths.dbFile, scan.files);
  const changeSummary = summarizeChanges(previousIndex.files, scan.files);

  const logger = createRunLogger(runtime.paths.dbFile);
  const run = logger.startRun({
    command: "index",
    input: "atlas index",
    metadata: {
      fileCount: scan.files.length,
      ignoredDirectories: scan.ignoredDirectories,
      changedFiles: changeSummary.changedFiles,
      newFiles: changeSummary.newFiles,
      deletedFiles: changeSummary.deletedFiles
    }
  });

  upsertRunSummaries(runtime.paths.dbFile, scan.files.slice(0, 20));

  logger.finishRun(run.id, {
    status: "completed",
    output: {
      indexedFiles: scan.files.length,
      symbolCount: scan.files.reduce((count, file) => count + file.symbols.length, 0),
      edgeCount: scan.files.reduce((count, file) => count + file.imports.length + file.calls.length + file.relationships.length, 0),
      changeSummary
    },
    metrics: {
      filesIndexed: scan.files.length,
      symbolsIndexed: scan.files.reduce((count, file) => count + file.symbols.length, 0),
      importEdgesIndexed: scan.files.reduce((count, file) => count + file.imports.length, 0),
      callEdgesIndexed: scan.files.reduce((count, file) => count + file.calls.length, 0),
      relationshipEdgesIndexed: scan.files.reduce((count, file) => count + file.relationships.length, 0),
      changedFiles: changeSummary.changedFiles
    }
  });

  return {
    ok: true,
    command: "index",
    root: runtime.rootDir,
    indexedFiles: scan.files.length,
    indexedSymbols: scan.files.reduce((count, file) => count + file.symbols.length, 0),
    indexedImportEdges: scan.files.reduce((count, file) => count + file.imports.length, 0),
    indexedCallEdges: scan.files.reduce((count, file) => count + file.calls.length, 0),
    indexedRelationshipEdges: scan.files.reduce((count, file) => count + file.relationships.length, 0),
    changeSummary,
    topFiles: scan.files.slice(0, 10).map((file) => ({
      path: file.path,
      language: file.language,
      symbols: file.symbols.length,
      imports: file.imports.length,
      calls: file.calls.length,
      relationships: file.relationships.length
    }))
  };
}

function summarizeChanges(previousFiles, nextFiles) {
  const previousByPath = new Map(previousFiles.map((file) => [file.path, file.hash]));
  const nextPaths = new Set(nextFiles.map((file) => file.path));

  let changedFiles = 0;
  let newFiles = 0;
  for (const file of nextFiles) {
    const previousHash = previousByPath.get(file.path);
    if (!previousHash) {
      newFiles += 1;
      continue;
    }
    if (previousHash !== file.hash) {
      changedFiles += 1;
    }
  }

  let deletedFiles = 0;
  for (const previousFile of previousFiles) {
    if (!nextPaths.has(previousFile.path)) {
      deletedFiles += 1;
    }
  }

  return {
    newFiles,
    changedFiles,
    deletedFiles,
    unchangedFiles: Math.max(0, nextFiles.length - newFiles - changedFiles)
  };
}
