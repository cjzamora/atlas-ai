import { executeSql, querySql } from "./sqlite.js";

export function initializeDatabase(dbFile) {
  executeSql(
    dbFile,
    `
      pragma journal_mode = wal;

      create table if not exists files (
        path text primary key,
        language text not null,
        size_bytes integer not null,
        sha1 text not null,
        summary text not null,
        indexed_at text not null
      );

      create table if not exists symbols (
        file_path text not null,
        name text not null,
        kind text not null,
        primary key (file_path, name, kind)
      );

      create table if not exists edges (
        source_path text not null,
        edge_type text not null,
        specifier text not null,
        target_path text not null default '',
        primary key (source_path, edge_type, specifier, target_path)
      );

      create table if not exists runs (
        id integer primary key autoincrement,
        command text not null,
        input text not null,
        status text not null,
        metadata_json text not null,
        output_json text,
        metrics_json text,
        started_at text not null,
        finished_at text
      );

      create table if not exists memory_records (
        id integer primary key autoincrement,
        source_run_id integer,
        summary text not null,
        tags text not null,
        confidence text not null,
        created_at text not null
      );
    `
  );

  executeSql(
    dbFile,
    `
      update runs
      set
        status='interrupted',
        finished_at='${new Date().toISOString()}'
      where status='running';
    `
  );
}

export function upsertFiles(dbFile, files) {
  const indexedAt = new Date().toISOString();
  executeSql(
    dbFile,
    `
      begin;
      delete from symbols;
      delete from edges;
      ${files.map((file) => `
        insert into files(path, language, size_bytes, sha1, summary, indexed_at)
        values(
          '${escapeSql(file.path)}',
          '${escapeSql(file.language)}',
          ${file.sizeBytes},
          '${escapeSql(file.hash)}',
          '${escapeSql(file.summary)}',
          '${indexedAt}'
        )
        on conflict(path) do update set
          language=excluded.language,
          size_bytes=excluded.size_bytes,
          sha1=excluded.sha1,
          summary=excluded.summary,
          indexed_at=excluded.indexed_at;
      `).join("\n")}
      ${files.flatMap((file) => file.symbols.map((symbol) => `
        insert into symbols(file_path, name, kind)
        values(
          '${escapeSql(file.path)}',
          '${escapeSql(symbol.name)}',
          '${escapeSql(symbol.kind)}'
        )
        on conflict(file_path, name, kind) do nothing;
      `)).join("\n")}
      ${files.flatMap((file) => file.imports.map((entry) => `
        insert into edges(source_path, edge_type, specifier, target_path)
        values(
          '${escapeSql(file.path)}',
          '${escapeSql(entry.edgeType)}',
          '${escapeSql(entry.specifier)}',
          '${escapeSql(entry.targetPath || "")}'
        )
        on conflict(source_path, edge_type, specifier, target_path) do nothing;
      `)).join("\n")}
      ${files.flatMap((file) => file.calls.map((entry) => `
        insert into edges(source_path, edge_type, specifier, target_path)
        values(
          '${escapeSql(file.path)}',
          '${escapeSql(entry.edgeType)}',
          '${escapeSql(entry.specifier)}',
          '${escapeSql(entry.targetPath || "")}'
        )
        on conflict(source_path, edge_type, specifier, target_path) do nothing;
      `)).join("\n")}
      ${files.flatMap((file) => file.relationships.map((entry) => `
        insert into edges(source_path, edge_type, specifier, target_path)
        values(
          '${escapeSql(file.path)}',
          '${escapeSql(entry.edgeType)}',
          '${escapeSql(entry.specifier)}',
          '${escapeSql(entry.targetPath || "")}'
        )
        on conflict(source_path, edge_type, specifier, target_path) do nothing;
      `)).join("\n")}
      delete from files
      where path not in (${files.length === 0 ? "''" : files.map((file) => `'${escapeSql(file.path)}'`).join(", ")});
      commit;
    `
  );
}

export function insertRun(dbFile, { command, input, metadata }) {
  const rows = querySql(
    dbFile,
    `
      insert into runs(command, input, status, metadata_json, started_at)
      values(
        '${escapeSql(command)}',
        '${escapeSql(input)}',
        'running',
        '${escapeSql(JSON.stringify(metadata || {}))}',
        '${new Date().toISOString()}'
      )
      returning id;
    `
  );

  return { id: rows[0].id };
}

export function updateRun(dbFile, id, payload) {
  executeSql(
    dbFile,
    `
      update runs
      set
        status='${escapeSql(payload.status || "completed")}',
        output_json='${escapeSql(JSON.stringify(payload.output || {}))}',
        metrics_json='${escapeSql(JSON.stringify(payload.metrics || {}))}',
        finished_at='${new Date().toISOString()}'
      where id=${Number(id)};
    `
  );

  maybeLearnFromRun(dbFile, id, payload);
}

export function listRuns(dbFile, limit) {
  const options = normalizeRunListOptions(limit);
  const whereClauses = [];
  if (options.command) {
    whereClauses.push(`command = '${escapeSql(options.command)}'`);
  }
  if (options.status) {
    whereClauses.push(`status = '${escapeSql(options.status)}'`);
  }
  const where = whereClauses.length > 0 ? `where ${whereClauses.join(" and ")}` : "";

  const rows = querySql(
    dbFile,
    `
      select
        id,
        command,
        input,
        status,
        metadata_json as metadataJson,
        output_json as outputJson,
        metrics_json as metricsJson,
        started_at as startedAt,
        finished_at as finishedAt
      from runs
      ${where}
      order by id desc
      limit ${options.limit};
    `
  );

  return rows.map((row) => summarizeRun(row));
}

export function searchMemory(dbFile, query, limit) {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((token) => token.length >= 3);

  if (tokens.length === 0) {
    return [];
  }

  const where = tokens
    .map((token) => `(lower(summary) like '%${escapeSql(token)}%' or lower(tags) like '%${escapeSql(token)}%')`)
    .join(" or ");

  return querySql(
    dbFile,
    `
      select id, source_run_id as sourceRunId, summary, tags, confidence, created_at as createdAt
      from memory_records
      where ${where}
      order by
        case confidence
          when 'high' then 3
          when 'medium' then 2
          when 'low' then 1
          else 0
        end desc,
        id desc
      limit ${Math.max(1, Number(limit || 5))};
    `
  ).map((row) => summarizeMemoryRecord(row));
}

export function findRelevantRunPatterns(dbFile, query, limit = 3) {
  const matches = searchMemory(dbFile, query, Math.max(1, Number(limit || 3)) * 4)
    .filter((entry) => entry.type === "run_outcome" && entry.tags.includes("command:fix"))
    .slice(0, Math.max(1, Number(limit || 3)));

  return matches.map((entry) => ({
    id: entry.id,
    sourceRunId: entry.sourceRunId,
    summary: entry.summary,
    outcome: extractTaggedValue(entry.tags, "outcome") || "unknown",
    files: entry.tags
      .filter((tag) => tag.startsWith("file:"))
      .map((tag) => tag.slice("file:".length)),
    tests: entry.tags
      .filter((tag) => tag.startsWith("test:"))
      .map((tag) => tag.slice("test:".length)),
    confidence: entry.confidence
  }));
}

export function getCostReport(dbFile) {
  const runCounts = querySql(
    dbFile,
    `
      select
        count(*) as totalRuns,
        sum(case when command = 'index' then 1 else 0 end) as indexRuns,
        sum(case when command = 'ask' then 1 else 0 end) as askRuns,
        sum(case when command = 'plan' then 1 else 0 end) as planRuns,
        sum(case when command = 'fix' then 1 else 0 end) as fixRuns
      from runs;
    `
  )[0] || {};

  const fileStats = querySql(
    dbFile,
    `
      select count(*) as indexedFiles, sum(size_bytes) as indexedBytes
      from files;
    `
  )[0] || {};

  const edgeStats = querySql(
    dbFile,
    `
      select
        count(*) as totalEdges,
        sum(case when edge_type = 'import' then 1 else 0 end) as internalImportEdges,
        sum(case when edge_type = 'external_import' then 1 else 0 end) as externalImportEdges,
        sum(case when edge_type = 'call' then 1 else 0 end) as callEdges,
        sum(case when edge_type = 'tests' then 1 else 0 end) as testEdges,
        sum(case when edge_type = 'tested_by' then 1 else 0 end) as testedByEdges
      from edges;
    `
  )[0] || {};

  const outcomeRows = querySql(
    dbFile,
    `
      select output_json as outputJson
      from runs
      where output_json is not null and output_json <> '';
    `
  );
  const outcomeCounts = summarizeOutcomeCounts(outcomeRows);

  const tokenRows = querySql(
    dbFile,
    `
      select metadata_json as metadataJson, metrics_json as metricsJson
      from runs
      where metrics_json is not null and metrics_json <> '';
    `
  );
  const tokenUsage = summarizeTokenUsage(tokenRows);

  const missRateRows = querySql(
    dbFile,
    `
      select metrics_json as metricsJson
      from runs
      where command = 'test_missrate' and metrics_json is not null and metrics_json <> '';
    `
  );
  const selectionMissRate = summarizeMissRate(missRateRows);

  return {
    totalRuns: Number(runCounts.totalRuns || 0),
    indexRuns: Number(runCounts.indexRuns || 0),
    askRuns: Number(runCounts.askRuns || 0),
    planRuns: Number(runCounts.planRuns || 0),
    fixRuns: Number(runCounts.fixRuns || 0),
    indexedFiles: Number(fileStats.indexedFiles || 0),
    indexedBytes: Number(fileStats.indexedBytes || 0),
    totalEdges: Number(edgeStats.totalEdges || 0),
    internalImportEdges: Number(edgeStats.internalImportEdges || 0),
    externalImportEdges: Number(edgeStats.externalImportEdges || 0),
    callEdges: Number(edgeStats.callEdges || 0),
    testEdges: Number(edgeStats.testEdges || 0),
    testedByEdges: Number(edgeStats.testedByEdges || 0),
    confirmedRuns: outcomeCounts.confirmed,
    validationFailedRuns: outcomeCounts.validationFailed,
    applyFailedValidationRuns: outcomeCounts.applyFailedValidation,
    rolledBackRuns: outcomeCounts.rolledBack,
    tokenUsage,
    selectionMissRate
  };
}

// Rolling impacted-test selection miss rate across recorded `test missrate` runs —
// the confirm step's trust level (how often a real failure escapes selection).
function summarizeMissRate(rows) {
  const rates = [];
  for (const row of rows) {
    const metrics = parseJson(row.metricsJson);
    if (typeof metrics.missRate === "number" && Number.isFinite(metrics.missRate)) {
      rates.push(metrics.missRate);
    }
  }
  if (rates.length === 0) {
    return { samples: 0, averageMissRate: null };
  }
  return {
    samples: rates.length,
    averageMissRate: rates.reduce((sum, rate) => sum + rate, 0) / rates.length
  };
}

// Aggregate the per-run token metrics that exec/patch/fix already record into a
// total + per-model breakdown, so `cost report` exposes real usage for routing
// and budgeting instead of a placeholder.
function summarizeTokenUsage(rows) {
  const byModel = new Map();
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let runsWithTokenData = 0;

  for (const row of rows) {
    const metrics = parseJson(row.metricsJson);
    const metadata = parseJson(row.metadataJson);
    const input = Number(metrics.inputTokens || 0);
    const output = Number(metrics.outputTokens || 0);
    const total = Number(metrics.totalTokens || 0) || input + output;
    if (total <= 0 && input <= 0 && output <= 0) {
      continue;
    }

    runsWithTokenData += 1;
    inputTokens += input;
    outputTokens += output;
    totalTokens += total;

    const provider = metrics.provider || metadata.provider || "unknown";
    const model = metrics.model || metadata.model || "unknown";
    const key = `${provider}:${model}`;
    const entry = byModel.get(key) || {
      provider,
      model,
      runs: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0
    };
    entry.runs += 1;
    entry.inputTokens += input;
    entry.outputTokens += output;
    entry.totalTokens += total;
    byModel.set(key, entry);
  }

  return {
    runsWithTokenData,
    inputTokens,
    outputTokens,
    totalTokens,
    byModel: [...byModel.values()].sort((left, right) => right.totalTokens - left.totalTokens)
  };
}

export function getIndexSnapshot(dbFile) {
  return {
    files: querySql(
      dbFile,
      `
        select path, sha1 as hash
        from files;
      `
    )
  };
}

export function upsertRunSummaries(dbFile, files) {
  if (files.length === 0) {
    return;
  }

  executeSql(
    dbFile,
    `
      ${files.map((file) => `
        insert into memory_records(source_run_id, summary, tags, confidence, created_at)
        values(
          null,
          '${escapeSql(`Indexed file: ${file.path}. ${file.summary}`)}',
          '${escapeSql(file.language)}',
          'low',
          '${new Date().toISOString()}'
        );
      `).join("\n")}
    `
  );
}

function maybeLearnFromRun(dbFile, id, payload) {
  const record = deriveMemoryRecord(payload.output);
  if (!record) {
    return;
  }

  const duplicateRows = querySql(
    dbFile,
    `
      select id
      from memory_records
      where summary = '${escapeSql(record.summary)}'
        and tags = '${escapeSql(record.tags.join(","))}'
      limit 1;
    `
  );
  if (duplicateRows.length > 0) {
    return;
  }

  executeSql(
    dbFile,
    `
      insert into memory_records(source_run_id, summary, tags, confidence, created_at)
      values(
        ${Number(id)},
        '${escapeSql(record.summary)}',
        '${escapeSql(record.tags.join(","))}',
        '${escapeSql(record.confidence)}',
        '${new Date().toISOString()}'
      );
    `
  );
}

function deriveMemoryRecord(output) {
  if (!output || typeof output !== "object") {
    return null;
  }

  const runOutcomeRecord = deriveRunOutcomeMemory(output);
  if (runOutcomeRecord) {
    return runOutcomeRecord;
  }

  if (output.summary) {
    return {
      summary: String(output.summary),
      tags: ["type:summary"],
      confidence: "medium"
    };
  }

  if (output.answer) {
    return {
      summary: String(output.answer),
      tags: ["type:answer"],
      confidence: "medium"
    };
  }

  return null;
}

function deriveRunOutcomeMemory(output) {
  const command = String(output.command || "");
  const outcome = String(output.status || "");
  const task = String(output.task || output.input || "").trim();
  if (!command || !outcome || !task) {
    return null;
  }

  if (command === "fix" && outcome === "confirmed") {
    const changedFiles = output.apply?.changedFiles || [];
    const selectedTests = output.stage?.request?.selectedTests || [];
    return {
      summary: `Confirmed fix for "${task}" touching ${changedFiles.length} file(s) with ${selectedTests.length} selected test(s).`,
      tags: [
        "type:run_outcome",
        "command:fix",
        "outcome:confirmed",
        ...(output.memoryAssistance?.matchedPatternCount > 0 ? ["memory:assisted"] : []),
        ...changedFiles.map((file) => `file:${file}`),
        ...selectedTests.map((testPath) => `test:${testPath}`),
        ...tokenTags(task)
      ],
      confidence: "high"
    };
  }

  if (command === "fix" && outcome === "rolled_back") {
    const rolledBackFiles = output.rollback?.changedFiles || output.artifact?.rolledBackFiles || [];
    return {
      summary: `Rolled back fix for "${task}" after failed confirmation across ${rolledBackFiles.length} file(s).`,
      tags: [
        "type:run_outcome",
        "command:fix",
        "outcome:rolled_back",
        ...(output.memoryAssistance?.matchedPatternCount > 0 ? ["memory:assisted"] : []),
        ...rolledBackFiles.map((file) => `file:${file}`),
        ...tokenTags(task)
      ],
      confidence: "medium"
    };
  }

  if (command === "fix" && outcome === "apply_failed_validation") {
    const failureReason = output.failureReason || output.apply?.failureReason || "unknown validation failure";
    const changedFiles = output.apply?.changedFiles || [];
    return {
      summary: `Post-apply validation failed for "${task}": ${failureReason}.`,
      tags: [
        "type:run_outcome",
        "command:fix",
        "outcome:apply_failed_validation",
        ...(output.memoryAssistance?.matchedPatternCount > 0 ? ["memory:assisted"] : []),
        ...changedFiles.map((file) => `file:${file}`),
        ...tokenTags(task)
      ],
      confidence: "medium"
    };
  }

  return null;
}

function normalizeRunListOptions(limitOrOptions) {
  if (typeof limitOrOptions === "object" && limitOrOptions !== null) {
    return {
      limit: Math.max(1, Number(limitOrOptions.limit || 10)),
      command: limitOrOptions.command ? String(limitOrOptions.command) : null,
      status: limitOrOptions.status ? String(limitOrOptions.status) : null
    };
  }

  return {
    limit: Math.max(1, Number(limitOrOptions || 10)),
    command: null,
    status: null
  };
}

function summarizeRun(row) {
  const metadata = parseJson(row.metadataJson);
  const output = parseJson(row.outputJson);
  const metrics = parseJson(row.metricsJson);
  const changedFiles = output?.apply?.changedFiles || output?.changedFiles || [];
  const artifactId = output?.artifactId || output?.artifact?.id || null;
  const handoff = output?.handoff || null;
  const importSource = output?.artifact?.importSource || metadata.importSource || null;

  return {
    id: row.id,
    command: row.command,
    input: row.input,
    task: output?.task || row.input,
    status: row.status,
    outcome: output?.status || row.status,
    failureReason: output?.failureReason || output?.error?.message || output?.validation?.failureReason || output?.postApplyValidation?.failureReason || null,
    memoryAssisted: Number(output?.memoryAssistance?.matchedPatternCount || 0) > 0 || Boolean(output?.memoryAssistance?.retrievalBoostApplied) || Boolean(output?.memoryAssistance?.testBoostApplied),
    matchedPatternCount: Number(output?.memoryAssistance?.matchedPatternCount || 0),
    memoryOutcome: output?.status || null,
    provider: metadata.provider || null,
    model: metadata.model || null,
    executionMode: metadata.executionMode || null,
    artifactId,
    target: handoff?.target || null,
    importSourceType: importSource?.type || null,
    importSourcePath: importSource?.path || null,
    selectedTests: Number(metrics.selectedTests || 0),
    totalTokens: Number(metrics.totalTokens || 0),
    changedFiles,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt
  };
}

function summarizeMemoryRecord(row) {
  const tags = String(row.tags || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return {
    id: row.id,
    sourceRunId: row.sourceRunId,
    summary: row.summary,
    type: tags.find((entry) => entry.startsWith("type:"))?.slice("type:".length) || "note",
    tags,
    confidence: row.confidence,
    createdAt: row.createdAt
  };
}

function extractTaggedValue(tags, key) {
  const match = (tags || []).find((entry) => entry.startsWith(`${key}:`));
  return match ? match.slice(`${key}:`.length) : null;
}

function tokenTags(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((token) => token.length >= 3)
    .slice(0, 6)
    .map((token) => `topic:${token}`);
}

function parseJson(value) {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function summarizeOutcomeCounts(rows) {
  return rows.reduce(
    (summary, row) => {
      const output = parseJson(row.outputJson);
      if (String(output?.command || "") !== "fix") {
        return summary;
      }
      const outcome = String(output?.status || "");
      if (outcome === "confirmed") {
        summary.confirmed += 1;
      } else if (outcome === "validation_failed") {
        summary.validationFailed += 1;
      } else if (outcome === "apply_failed_validation") {
        summary.applyFailedValidation += 1;
      } else if (outcome === "rolled_back") {
        summary.rolledBack += 1;
      }
      return summary;
    },
    {
      confirmed: 0,
      validationFailed: 0,
      applyFailedValidation: 0,
      rolledBack: 0
    }
  );
}

function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}
