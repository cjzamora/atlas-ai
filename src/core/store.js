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
  return querySql(
    dbFile,
    `
      select id, command, input, status, started_at as startedAt, finished_at as finishedAt
      from runs
      order by id desc
      limit ${Math.max(1, Number(limit || 10))};
    `
  );
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
    .map((token) => `lower(summary) like '%${escapeSql(token)}%'`)
    .join(" or ");

  return querySql(
    dbFile,
    `
      select id, source_run_id as sourceRunId, summary, tags, confidence, created_at as createdAt
      from memory_records
      where ${where}
      order by id desc
      limit ${Math.max(1, Number(limit || 5))};
    `
  );
}

export function getCostReport(dbFile) {
  const runCounts = querySql(
    dbFile,
    `
      select
        count(*) as totalRuns,
        sum(case when command = 'index' then 1 else 0 end) as indexRuns,
        sum(case when command = 'ask' then 1 else 0 end) as askRuns,
        sum(case when command = 'plan' then 1 else 0 end) as planRuns
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

  return {
    totalRuns: Number(runCounts.totalRuns || 0),
    indexRuns: Number(runCounts.indexRuns || 0),
    askRuns: Number(runCounts.askRuns || 0),
    planRuns: Number(runCounts.planRuns || 0),
    indexedFiles: Number(fileStats.indexedFiles || 0),
    indexedBytes: Number(fileStats.indexedBytes || 0),
    totalEdges: Number(edgeStats.totalEdges || 0),
    internalImportEdges: Number(edgeStats.internalImportEdges || 0),
    externalImportEdges: Number(edgeStats.externalImportEdges || 0),
    callEdges: Number(edgeStats.callEdges || 0),
    testEdges: Number(edgeStats.testEdges || 0),
    testedByEdges: Number(edgeStats.testedByEdges || 0),
    tokenEstimates: "Model token tracking is not wired yet in v0 scaffold."
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
  const summary = deriveMemorySummary(payload.output);
  if (!summary) {
    return;
  }

  executeSql(
    dbFile,
    `
      insert into memory_records(source_run_id, summary, tags, confidence, created_at)
      values(
        ${Number(id)},
        '${escapeSql(summary)}',
        '${escapeSql(payload.status || "completed")}',
        'medium',
        '${new Date().toISOString()}'
      );
    `
  );
}

function deriveMemorySummary(output) {
  if (!output || typeof output !== "object") {
    return null;
  }

  if (output.summary) {
    return String(output.summary);
  }

  if (output.answer) {
    return String(output.answer);
  }

  return null;
}

function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}
