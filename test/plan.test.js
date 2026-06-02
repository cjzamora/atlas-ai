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

    const task = "fix pricing coupon discount bug";
    const classification = classifyTask(task);
    const evidence = searchEvidence(runtime.paths.dbFile, task, 5);
    const impacted = selectImpactedTests(runtime.paths.dbFile, task, 5);
    const plan = buildPlanArtifact(task, classification, evidence.matches, impacted);

    assert.equal(plan.validationStrategy.mode, "graph");
    assert.ok(plan.selectedTests.includes("test/services/pricing.test.js"));
    assert.ok(plan.selectedTests.includes("test/services/checkout.test.js"));
    assert.deepEqual(plan.likelyTests, plan.selectedTests);
    assert.ok(plan.validationStrategy.directTests.includes("test/services/pricing.test.js"));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("pricing-focused bug plans rank pricing evidence ahead of downstream checkout files", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-plan-ranking-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const task = "fix pricing fallback bug";
    const classification = classifyTask(task);
    const evidence = searchEvidence(runtime.paths.dbFile, task, 5);
    const impacted = selectImpactedTests(runtime.paths.dbFile, task, 5);
    const plan = buildPlanArtifact(task, classification, evidence.matches, impacted);

    assert.equal(evidence.matches[0].path, "src/services/pricing.js");
    assert.equal(plan.selectedTests[0], "test/services/pricing.test.js");
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
      input: "fix pricing fallback bug",
      metadata: {
        provider: "openai",
        model: "gpt-5.4"
      }
    });
    updateRun(runtime.paths.dbFile, priorRun.id, {
      status: "completed",
      output: {
        command: "fix",
        task: "fix pricing fallback bug",
        status: "confirmed",
        apply: {
          changedFiles: ["src/services/pricing.js"]
        },
        stage: {
          request: {
            selectedTests: ["test/services/pricing.test.js"]
          }
        }
      },
      metrics: {
        totalTokens: 30,
        selectedTests: 1,
        changedFiles: 1
      }
    });

    const task = "fix pricing fallback bug";
    const classification = classifyTask(task);
    const evidence = searchEvidence(runtime.paths.dbFile, task, 5);
    const impacted = selectImpactedTests(runtime.paths.dbFile, task, 5);
    const priorPatterns = findRelevantRunPatterns(runtime.paths.dbFile, task, 3);
    const plan = buildPlanArtifact(task, classification, evidence.matches, impacted, priorPatterns);

    assert.equal(plan.priorPatterns.length, 1);
    assert.equal(plan.priorPatterns[0].outcome, "confirmed");
    assert.ok(plan.priorPatterns[0].files.includes("src/services/pricing.js"));
    assert.ok(plan.priorPatterns[0].tests.includes("test/services/pricing.test.js"));
    assert.equal(plan.likelyFiles[0], "src/services/pricing.js");
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

    const before = searchEvidence(runtime.paths.dbFile, "fix fallback regression", 5);
    assert.equal(before.matches[0].path, "src/controllers/checkout-controller.js");

    const priorRun = insertRun(runtime.paths.dbFile, {
      command: "fix",
      input: "fix pricing fallback bug",
      metadata: {
        provider: "openai",
        model: "gpt-5.4"
      }
    });
    updateRun(runtime.paths.dbFile, priorRun.id, {
      status: "completed",
      output: {
        command: "fix",
        task: "fix pricing fallback bug",
        status: "confirmed",
        apply: {
          changedFiles: ["src/services/pricing.js"]
        },
        stage: {
          request: {
            selectedTests: ["test/services/pricing.test.js"]
          }
        }
      },
      metrics: {
        totalTokens: 30,
        selectedTests: 1,
        changedFiles: 1
      }
    });

    const after = searchEvidence(runtime.paths.dbFile, "fix fallback regression", 5);
    assert.equal(after.matches[0].path, "src/services/pricing.js");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("retrieval ranking prefers service implementations over resolver wrappers for service-shaped queries", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-plan-service-role-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.mkdir(path.join(workingRoot, "src", "modules", "stripe-connect"), { recursive: true });

    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "stripe-connect", "stripe-connect.service.ts"),
      [
        "export class StripeConnectService {",
        "  listCharges() { return 'charges'; }",
        "  startCheckoutSession() { return 'checkout'; }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "stripe-connect", "stripe-connect.resolver.ts"),
      [
        "import { StripeConnectService } from './stripe-connect.service';",
        "export class StripeConnectResolver {",
        "  constructor(private readonly stripeConnect: StripeConnectService) {}",
        "  stripeConnectAccounts() { return this.stripeConnect.listCharges(); }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "stripe-connect", "stripe-connect.model.ts"),
      [
        "export type StripeConnectAccountSummary = {",
        "  accountId: string;",
        "};"
      ].join("\n")
    );

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const evidence = searchEvidence(
      runtime.paths.dbFile,
      "stripe connect payments checkout connected account list charges",
      5
    );

    assert.equal(evidence.matches[0].path, "src/modules/stripe-connect/stripe-connect.service.ts");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("retrieval ranking prefers validation files over dashboard resolver wrappers for validation-shaped queries", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-plan-validation-role-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.mkdir(path.join(workingRoot, "src", "modules", "transfermate-beneficiaries"), { recursive: true });

    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "transfermate-beneficiaries", "transfermate-beneficiary.validation.ts"),
      [
        "export function assertValidAccountNumber(countryCode, accountNumber) {",
        "  return `${countryCode}:${accountNumber}`;",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "transfermate-beneficiaries", "dashboard-transfermate-beneficiary.resolver.ts"),
      [
        "import { assertValidAccountNumber } from './transfermate-beneficiary.validation';",
        "export class DashboardTransfermateBeneficiaryResolver {",
        "  transfermateBeneficiariesForApp() {",
        "    return assertValidAccountNumber('US', '123');",
        "  }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "transfermate-beneficiaries", "transfermate-beneficiary.model.ts"),
      [
        "export type TransfermateBeneficiary = {",
        "  accountNumber: string;",
        "};"
      ].join("\n")
    );

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const evidence = searchEvidence(
      runtime.paths.dbFile,
      "transfermate beneficiary validation account number country",
      5
    );

    assert.equal(
      evidence.matches[0].path,
      "src/modules/transfermate-beneficiaries/transfermate-beneficiary.validation.ts"
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("retrieval ranking prefers webhook service and queue implementations over resolver wrappers for delivery queries", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-plan-webhook-role-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.mkdir(path.join(workingRoot, "src", "modules", "webhooks"), { recursive: true });

    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "webhooks", "webhooks.service.ts"),
      [
        "export class WebhooksService {",
        "  processProviderEvent() { return 'processed'; }",
        "  retryWebhookDelivery() { return 'retried'; }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "webhooks", "webhook-queue.service.ts"),
      [
        "export class WebhookQueueService {",
        "  enqueueRetryJob() { return 'queued'; }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "webhooks", "webhooks.resolver.ts"),
      [
        "import { WebhooksService } from './webhooks.service';",
        "export class WebhooksResolver {",
        "  constructor(private readonly webhooksService: WebhooksService) {}",
        "  webhookEvents() { return this.webhooksService.processProviderEvent(); }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "webhooks", "webhook.model.ts"),
      [
        "export type WebhookEvent = {",
        "  provider: string;",
        "};"
      ].join("\n")
    );

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const evidence = searchEvidence(
      runtime.paths.dbFile,
      "webhook delivery retry queue provider event processing",
      5
    );

    assert.ok(
      evidence.matches.slice(0, 2).some((match) => match.path === "src/modules/webhooks/webhooks.service.ts")
    );
    assert.ok(
      evidence.matches.slice(0, 2).some((match) => match.path === "src/modules/webhooks/webhook-queue.service.ts")
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("retrieval ranking prefers mapper and inngest implementations over xero wrappers for sync queries", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-plan-mapper-role-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.mkdir(path.join(workingRoot, "src", "modules", "xero"), { recursive: true });

    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "xero", "xero.mapper.ts"),
      [
        "export function mapTenantWebhookPayload(payload) {",
        "  return payload.tenantId;",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "xero", "xero.service.ts"),
      [
        "import { mapTenantWebhookPayload } from './xero.mapper';",
        "export class XeroService {",
        "  syncTenantWebhook(payload) { return mapTenantWebhookPayload(payload); }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "xero", "xero.inngest.ts"),
      [
        "import { XeroService } from './xero.service';",
        "export function syncTenantJob(service, payload) {",
        "  return service.syncTenantWebhook(payload);",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "xero", "xero.resolver.ts"),
      [
        "import { XeroService } from './xero.service';",
        "export class XeroResolver {",
        "  constructor(private readonly xeroService: XeroService) {}",
        "  xeroTenant() { return this.xeroService.syncTenantWebhook({ tenantId: '1' }); }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "xero", "dashboard-xero.resolver.ts"),
      [
        "import { XeroService } from './xero.service';",
        "export class DashboardXeroResolver {",
        "  constructor(private readonly xeroService: XeroService) {}",
        "  dashboardTenant() { return this.xeroService.syncTenantWebhook({ tenantId: '1' }); }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "xero", "xero.model.ts"),
      [
        "export type XeroTenant = {",
        "  tenantId: string;",
        "};"
      ].join("\n")
    );

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const evidence = searchEvidence(runtime.paths.dbFile, "xero mapper sync inngest tenant webhook", 5);

    assert.equal(evidence.matches[0].path, "src/modules/xero/xero.mapper.ts");
    assert.ok(
      evidence.matches.slice(0, 3).some((match) => match.path === "src/modules/xero/xero.service.ts")
    );
    assert.ok(
      evidence.matches.slice(0, 3).some((match) => match.path === "src/modules/xero/xero.inngest.ts")
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("retrieval ranking prefers stripe connect service over model and resolver wrappers when model symbols match heavily", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-plan-stripe-connect-model-noise-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.mkdir(path.join(workingRoot, "src", "modules", "stripe-connect"), { recursive: true });

    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "stripe-connect", "stripe-connect.service.ts"),
      [
        "export class StripeConnectService {",
        "  createConnectedAccountLoginLink() { return 'login-link'; }",
        "  listConnectedAccountCharges() { return 'charges'; }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "stripe-connect", "stripe-connect.resolver.ts"),
      [
        "import { StripeConnectService } from './stripe-connect.service';",
        "export class StripeConnectResolver {",
        "  constructor(private readonly stripeConnect: StripeConnectService) {}",
        "  connectedAccountLoginLink() { return this.stripeConnect.createConnectedAccountLoginLink(); }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "stripe-connect", "stripe-connect.model.ts"),
      [
        "export type StripeConnectConnectedAccount = {",
        "  stripeConnectAccountId: string;",
        "  connectedAccountLoginLink: string;",
        "  connectedAccountCharges: number;",
        "};"
      ].join("\n")
    );

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const evidence = searchEvidence(
      runtime.paths.dbFile,
      "stripe connect connected account onboarding login link charges",
      5
    );

    assert.equal(evidence.matches[0].path, "src/modules/stripe-connect/stripe-connect.service.ts");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("retrieval ranking prefers provider-specific webhook controller over shared webhook service for signature queries", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-plan-provider-webhook-controller-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.mkdir(path.join(workingRoot, "src", "modules", "xero"), { recursive: true });
    await fs.mkdir(path.join(workingRoot, "src", "modules", "webhooks"), { recursive: true });

    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "xero", "xero-webhook.controller.ts"),
      [
        "export class XeroWebhookController {",
        "  verifyXeroWebhookSignature(rawBody, webhookKey) { return `${rawBody}:${webhookKey}`; }",
        "  recordInboundXeroWebhookEvent() { return 'xero-webhook'; }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "xero", "xero.inngest.ts"),
      [
        "export function processXeroWebhookTenantJob() {",
        "  return 'tenant-job';",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "webhooks", "webhooks.service.ts"),
      [
        "export class WebhooksService {",
        "  recordInboundProviderEvent() { return 'provider-event'; }",
        "  enqueueInboundEvent() { return 'queue'; }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "webhooks", "webhook.model.ts"),
      [
        "export type WebhookEvent = {",
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
      "xero webhook signature inbound event queue tenant",
      5
    );

    assert.equal(evidence.matches[0].path, "src/modules/xero/xero-webhook.controller.ts");
    assert.ok(evidence.matches.slice(0, 3).some((match) => match.path === "src/modules/xero/xero.inngest.ts"));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
