import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { ensureAtlasRuntime } from "../src/core/runtime.js";
import { scanRepository } from "../src/core/scanner.js";
import { insertRun, updateRun, upsertFiles } from "../src/core/store.js";
import { searchEvidence } from "../src/core/retrieval.js";
import { classifyTask, buildPlanArtifact } from "../src/core/planner.js";
import { selectImpactedTests } from "../src/validation/test-selection.js";
import { findRelevantRunPatterns } from "../src/core/store.js";

const fixtureRoot = path.resolve("test/fixtures/sample-repo");

test("plan artifact includes graph-backed selected tests and validation strategy", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-plan-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const task = "fix metering ticket tally bug";
    const classification = classifyTask(task);
    const evidence = searchEvidence(runtime.paths.dbFile, task, 5);
    const impacted = selectImpactedTests(runtime.paths.dbFile, task, 5);
    const plan = buildPlanArtifact(task, classification, evidence.matches, impacted);

    assert.equal(plan.validationStrategy.mode, "graph");
    assert.ok(plan.selectedTests.includes("test/services/metering.test.js"));
    assert.ok(plan.selectedTests.includes("test/services/intake.test.js"));
    assert.deepEqual(plan.likelyTests, plan.selectedTests);
    assert.ok(plan.validationStrategy.directTests.includes("test/services/metering.test.js"));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("metering-focused bug plans rank metering evidence ahead of downstream intake files", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-plan-ranking-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const task = "fix metering fallback bug";
    const classification = classifyTask(task);
    const evidence = searchEvidence(runtime.paths.dbFile, task, 5);
    const impacted = selectImpactedTests(runtime.paths.dbFile, task, 5);
    const plan = buildPlanArtifact(task, classification, evidence.matches, impacted);

    assert.equal(evidence.matches[0].path, "src/services/metering.js");
    assert.equal(plan.selectedTests[0], "test/services/metering.test.js");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("plan artifact includes prior confirmed fix patterns as advisory memory", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-plan-memory-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const priorRun = insertRun(runtime.paths.dbFile, {
      command: "fix",
      input: "fix metering fallback bug",
      metadata: {
        provider: "openai",
        model: "gpt-5.4"
      }
    });
    updateRun(runtime.paths.dbFile, priorRun.id, {
      status: "completed",
      output: {
        command: "fix",
        task: "fix metering fallback bug",
        status: "confirmed",
        apply: {
          changedFiles: ["src/services/metering.js"]
        },
        stage: {
          request: {
            selectedTests: ["test/services/metering.test.js"]
          }
        }
      },
      metrics: {
        totalTokens: 30,
        selectedTests: 1,
        changedFiles: 1
      }
    });

    const task = "fix metering fallback bug";
    const classification = classifyTask(task);
    const evidence = searchEvidence(runtime.paths.dbFile, task, 5);
    const impacted = selectImpactedTests(runtime.paths.dbFile, task, 5);
    const priorPatterns = findRelevantRunPatterns(runtime.paths.dbFile, task, 3);
    const plan = buildPlanArtifact(task, classification, evidence.matches, impacted, priorPatterns);

    assert.equal(plan.priorPatterns.length, 1);
    assert.equal(plan.priorPatterns[0].outcome, "confirmed");
    assert.ok(plan.priorPatterns[0].files.includes("src/services/metering.js"));
    assert.ok(plan.priorPatterns[0].tests.includes("test/services/metering.test.js"));
    assert.equal(plan.likelyFiles[0], "src/services/metering.js");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("retrieval ranking uses prior confirmed fix memory as a bounded tie-breaker", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-plan-memory-boost-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    // "ticket tally" is a genuine near-tie: metering.js (calculateTally) edges
    // out intake.js (applyTicket) on lexical signal alone.
    const before = searchEvidence(runtime.paths.dbFile, "ticket tally", 5);
    assert.equal(before.matches[0].path, "src/services/metering.js");
    assert.equal(before.memoryAssistance.retrievalBoostApplied, false);

    const priorRun = insertRun(runtime.paths.dbFile, {
      command: "fix",
      input: "fix ticket tally in intake",
      metadata: {
        provider: "openai",
        model: "gpt-5.4"
      }
    });
    updateRun(runtime.paths.dbFile, priorRun.id, {
      status: "completed",
      output: {
        command: "fix",
        task: "fix ticket tally in intake",
        status: "confirmed",
        apply: {
          changedFiles: ["src/services/intake.js"]
        },
        stage: {
          request: {
            selectedTests: ["test/services/intake.test.js"]
          }
        }
      },
      metrics: {
        totalTokens: 30,
        selectedTests: 1,
        changedFiles: 1
      }
    });

    // A prior confirmed fix that touched intake.js acts as a bounded tie-breaker
    // that lifts intake.js past the near-tied metering.js.
    const after = searchEvidence(runtime.paths.dbFile, "ticket tally", 5);
    assert.equal(after.memoryAssistance.retrievalBoostApplied, true);
    assert.ok(after.memoryAssistance.boostedPaths.includes("src/services/intake.js"));
    assert.equal(after.matches[0].path, "src/services/intake.js");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("retrieval ranking prefers implementation files over thin wrapper files for implementation-shaped queries", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-plan-impl-role-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.mkdir(path.join(workingRoot, "src", "modules", "channel"), { recursive: true });

    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "channel", "channel.core.ts"),
      [
        "export class ChannelCore {",
        "  listChannelMetrics() { return 'metrics'; }",
        "  startChannelStream() { return 'stream'; }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "channel", "channel.gateway.ts"),
      [
        "import { ChannelCore } from './channel.core';",
        "export class ChannelGateway {",
        "  constructor(private readonly channel: ChannelCore) {}",
        "  channelOverview() { return this.channel.listChannelMetrics(); }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "channel", "channel.types.ts"),
      [
        "export type ChannelSummary = {",
        "  streamId: string;",
        "};"
      ].join("\n")
    );

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const evidence = searchEvidence(
      runtime.paths.dbFile,
      "channel stream metrics list overview",
      5
    );

    assert.equal(evidence.matches[0].path, "src/modules/channel/channel.core.ts");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("retrieval ranking prefers rules files over proxy gateway wrappers for rules-shaped queries", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-plan-rules-role-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.mkdir(path.join(workingRoot, "src", "modules", "directory-contacts"), { recursive: true });

    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "directory-contacts", "directory-contact.rules.ts"),
      [
        "export function checkContactAddressRegion(region, address) {",
        "  return `${region}:${address}`;",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "directory-contacts", "proxy-directory-contact.gateway.ts"),
      [
        "import { checkContactAddressRegion } from './directory-contact.rules';",
        "export class ProxyDirectoryContactGateway {",
        "  contactsForWorkspace() {",
        "    return checkContactAddressRegion('eu', 'main');",
        "  }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "directory-contacts", "directory-contact.types.ts"),
      [
        "export type DirectoryContact = {",
        "  address: string;",
        "};"
      ].join("\n")
    );

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const evidence = searchEvidence(
      runtime.paths.dbFile,
      "directory contact rules address region",
      5
    );

    assert.equal(
      evidence.matches[0].path,
      "src/modules/directory-contacts/directory-contact.rules.ts"
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("retrieval ranking prefers core and queue implementations over gateway wrappers for delivery queries", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-plan-delivery-role-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.mkdir(path.join(workingRoot, "src", "modules", "events"), { recursive: true });

    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "events", "events.core.ts"),
      [
        "export class EventsCore {",
        "  processProviderEvent() { return 'processed'; }",
        "  retryEventDelivery() { return 'retried'; }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "events", "event-queue.core.ts"),
      [
        "export class EventQueueCore {",
        "  enqueueRetryJob() { return 'queued'; }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "events", "events.gateway.ts"),
      [
        "import { EventsCore } from './events.core';",
        "export class EventsGateway {",
        "  constructor(private readonly eventsCore: EventsCore) {}",
        "  eventOverview() { return this.eventsCore.processProviderEvent(); }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "events", "event.types.ts"),
      [
        "export type EventRecord = {",
        "  provider: string;",
        "};"
      ].join("\n")
    );

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const evidence = searchEvidence(
      runtime.paths.dbFile,
      "event delivery retry queue provider processing",
      5
    );

    assert.ok(
      evidence.matches.slice(0, 2).some((match) => match.path === "src/modules/events/events.core.ts")
    );
    assert.ok(
      evidence.matches.slice(0, 2).some((match) => match.path === "src/modules/events/event-queue.core.ts")
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("retrieval ranking prefers implementation files over thin wrapper and type-only files for sync queries", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-plan-sync-role-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.mkdir(path.join(workingRoot, "src", "modules", "sync"), { recursive: true });

    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "sync", "sync.adapter.ts"),
      [
        "export function adaptSyncPayload(payload) {",
        "  return payload.recordId;",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "sync", "sync.core.ts"),
      [
        "import { adaptSyncPayload } from './sync.adapter';",
        "export class SyncCore {",
        "  runSyncRecord(payload) { return adaptSyncPayload(payload); }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "sync", "sync.worker.ts"),
      [
        "import { SyncCore } from './sync.core';",
        "export function syncRecordJob(core, payload) {",
        "  return core.runSyncRecord(payload);",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "sync", "sync.gateway.ts"),
      [
        "import { SyncCore } from './sync.core';",
        "export class SyncGateway {",
        "  constructor(private readonly syncCore: SyncCore) {}",
        "  syncRecord() { return this.syncCore.runSyncRecord({ recordId: '1' }); }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "sync", "proxy-sync.gateway.ts"),
      [
        "import { SyncCore } from './sync.core';",
        "export class ProxySyncGateway {",
        "  constructor(private readonly syncCore: SyncCore) {}",
        "  proxySyncRecord() { return this.syncCore.runSyncRecord({ recordId: '1' }); }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "sync", "sync.types.ts"),
      [
        "export type SyncRecord = {",
        "  recordId: string;",
        "};"
      ].join("\n")
    );

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const evidence = searchEvidence(runtime.paths.dbFile, "sync adapter record worker payload", 5);

    // Convention-free ranker: a real implementation (adapter/core/worker) leads on
    // lexical + structural signal; the thin gateway wrappers and the type-only file
    // do not win. No filename-suffix weighting is involved.
    const implementations = [
      "src/modules/sync/sync.adapter.ts",
      "src/modules/sync/sync.core.ts",
      "src/modules/sync/sync.worker.ts"
    ];
    assert.ok(
      implementations.includes(evidence.matches[0].path),
      `expected an implementation file first, got ${evidence.matches[0].path}`
    );
    const top3 = evidence.matches.slice(0, 3).map((match) => match.path);
    assert.ok(!top3.includes("src/modules/sync/proxy-sync.gateway.ts"));
    assert.ok(!top3.includes("src/modules/sync/sync.types.ts"));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("retrieval ranking prefers implementation over a type-only file when the type's field names match heavily", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-plan-type-noise-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.mkdir(path.join(workingRoot, "src", "modules", "channel"), { recursive: true });

    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "channel", "channel.core.ts"),
      [
        "export class ChannelCore {",
        "  createChannelStreamLink() { return 'stream-link'; }",
        "  listChannelStreamMetrics() { return 'metrics'; }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "channel", "channel.gateway.ts"),
      [
        "import { ChannelCore } from './channel.core';",
        "export class ChannelGateway {",
        "  constructor(private readonly channel: ChannelCore) {}",
        "  channelStreamLink() { return this.channel.createChannelStreamLink(); }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "channel", "channel.types.ts"),
      [
        "export type ChannelStreamRecord = {",
        "  channelStreamId: string;",
        "  channelStreamLink: string;",
        "  channelStreamMetrics: number;",
        "};"
      ].join("\n")
    );

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const evidence = searchEvidence(
      runtime.paths.dbFile,
      "channel stream onboarding link metrics",
      5
    );

    assert.equal(evidence.matches[0].path, "src/modules/channel/channel.core.ts");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("retrieval ranking prefers a domain-specific endpoint over a shared core for signature queries", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-plan-endpoint-signature-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.mkdir(path.join(workingRoot, "src", "modules", "inbound"), { recursive: true });
    await fs.mkdir(path.join(workingRoot, "src", "modules", "events"), { recursive: true });

    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "inbound", "inbound.endpoint.ts"),
      [
        "export class InboundEndpoint {",
        "  verifyInboundSignature(rawBody, signingKey) { return `${rawBody}:${signingKey}`; }",
        "  recordInboundChannelEvent() { return 'inbound-channel'; }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "inbound", "inbound.worker.ts"),
      [
        "export function processInboundChannelSignatureJob() {",
        "  return 'channel-job';",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "events", "events.core.ts"),
      [
        "export class EventsCore {",
        "  recordProviderEvent() { return 'provider-event'; }",
        "  enqueuePendingEvent() { return 'pending'; }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "events", "event.types.ts"),
      [
        "export type EventRecord = {",
        "  signature: string;",
        "  tenant: string;",
        "};"
      ].join("\n")
    );

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const evidence = searchEvidence(
      runtime.paths.dbFile,
      "inbound channel signature event queue",
      5
    );

    assert.equal(evidence.matches[0].path, "src/modules/inbound/inbound.endpoint.ts");
    assert.ok(evidence.matches.slice(0, 3).some((match) => match.path === "src/modules/inbound/inbound.worker.ts"));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
