import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { ensureAtlasRuntime } from "../src/core/runtime.js";
import { scanRepository } from "../src/core/scanner.js";
import { insertRun, updateRun, upsertFiles } from "../src/core/store.js";
import { selectImpactedTests } from "../src/validation/test-selection.js";

const fixtureRoot = path.resolve("test/fixtures/sample-repo");

test("impacted test selection returns relevant tests for metering changes", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-test-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const impacted = selectImpactedTests(runtime.paths.dbFile, "metering ticket tally", 5);
    assert.ok(impacted.impactedFiles.includes("src/services/metering.js"));
    assert.ok(impacted.tests.some((entry) => entry.path === "test/services/metering.test.js"));
    assert.ok(impacted.tests.some((entry) => entry.path === "test/services/intake.test.js"));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("impacted test selection ranks the most directly matching metering test first for metering bug queries", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-test-ranking-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const impacted = selectImpactedTests(runtime.paths.dbFile, "fix metering fallback bug", 5);
    assert.equal(impacted.tests[0].path, "test/services/metering.test.js");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("impacted test selection uses prior confirmed fix memory as a bounded tie-breaker", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-test-memory-boost-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.cp(fixtureRoot, workingRoot, { recursive: true });

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const before = selectImpactedTests(runtime.paths.dbFile, "fix baseline regression", 5);
    assert.equal(before.tests[0].path, "test/services/intake.test.js");

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

    const after = selectImpactedTests(runtime.paths.dbFile, "fix baseline regression", 5);
    assert.equal(after.tests[0].path, "test/services/metering.test.js");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("impacted test selection prefers direct structural tests over broad umbrella tests", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-test-structural-ranking-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.mkdir(path.join(workingRoot, "src", "core"), { recursive: true });
    await fs.mkdir(path.join(workingRoot, "test"), { recursive: true });

    await fs.writeFile(
      path.join(workingRoot, "src", "core", "scanner.js"),
      [
        "export function analyzeJavaScriptLikeSourceAst() {",
        "  return 'scanner';",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "core", "runtime.js"),
      [
        "export function ensureAtlasRuntime() {",
        "  return 'runtime';",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "core", "execution-builder.js"),
      [
        "import { analyzeJavaScriptLikeSourceAst } from './scanner.js';",
        "import { ensureAtlasRuntime } from './runtime.js';",
        "export function buildExecutionRequest() {",
        "  return [analyzeJavaScriptLikeSourceAst(), ensureAtlasRuntime()].join(':');",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "test", "scanner.test.js"),
      [
        "import { analyzeJavaScriptLikeSourceAst } from '../src/core/scanner.js';",
        "export function scannerTestCase() {",
        "  return analyzeJavaScriptLikeSourceAst();",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "test", "execution.test.js"),
      [
        "import { buildExecutionRequest } from '../src/core/execution-builder.js';",
        "import { analyzeJavaScriptLikeSourceAst } from '../src/core/scanner.js';",
        "import { ensureAtlasRuntime } from '../src/core/runtime.js';",
        "export function executionTestCase() {",
        "  return [buildExecutionRequest(), analyzeJavaScriptLikeSourceAst(), ensureAtlasRuntime()].join(':');",
        "}"
      ].join("\n")
    );

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const impacted = selectImpactedTests(runtime.paths.dbFile, "typescript ast scanner method calls imported services", 5);
    assert.equal(impacted.tests[0].path, "test/scanner.test.js");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("impacted test selection prefers direct auth service tests over broad neighboring service tests", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-test-auth-ranking-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.mkdir(path.join(workingRoot, "src", "modules", "auth"), { recursive: true });
    await fs.mkdir(path.join(workingRoot, "src", "modules", "apps"), { recursive: true });
    await fs.mkdir(path.join(workingRoot, "src", "modules", "customers"), { recursive: true });
    await fs.mkdir(path.join(workingRoot, "test", "modules"), { recursive: true });

    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "auth", "app-auth.service.ts"),
      [
        "export class AppAuthService {",
        "  getCurrentAppApiKey() { return 'key'; }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "auth", "app-auth.guard.ts"),
      [
        "import { AppAuthService } from './app-auth.service';",
        "export class AppAuthGuard {",
        "  constructor(private readonly auth: AppAuthService) {}",
        "  authorizeCurrentApp() { return this.auth.getCurrentAppApiKey(); }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "apps", "apps.service.ts"),
      [
        "export class AppsService {",
        "  listCurrentApps() { return []; }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "customers", "customers.service.ts"),
      [
        "export class CustomersService {",
        "  listCustomers() { return []; }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "test", "modules", "app-auth.service.spec.ts"),
      [
        "import { AppAuthService } from '../../src/modules/auth/app-auth.service.ts';",
        "export function appAuthServiceSpec() {",
        "  return new AppAuthService().getCurrentAppApiKey();",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "test", "modules", "apps.service.spec.ts"),
      [
        "import { AppsService } from '../../src/modules/apps/apps.service.ts';",
        "export function appsServiceSpec() {",
        "  return new AppsService().listCurrentApps();",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "test", "modules", "customers.service.spec.ts"),
      [
        "import { CustomersService } from '../../src/modules/customers/customers.service.ts';",
        "export function customersServiceSpec() {",
        "  return new CustomersService().listCustomers();",
        "}"
      ].join("\n")
    );

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const impacted = selectImpactedTests(runtime.paths.dbFile, "api key auth current app guard service", 5);
    assert.equal(impacted.tests[0].path, "test/modules/app-auth.service.spec.ts");
    assert.equal(
      impacted.impactedFiles.some((filePath) => /(^|\/)(test|tests|__tests__)\//.test(filePath) || /\.(test|spec)\./.test(filePath)),
      false
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("impacted test selection prefers same-entity validation tests over neighboring validation tests", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-test-validation-entity-ranking-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.mkdir(path.join(workingRoot, "src", "modules", "transfermate-beneficiaries"), { recursive: true });
    await fs.mkdir(path.join(workingRoot, "src", "modules", "transfermate-bank-accounts"), { recursive: true });
    await fs.mkdir(path.join(workingRoot, "test", "modules"), { recursive: true });

    await fs.writeFile(
      path.join(
        workingRoot,
        "src",
        "modules",
        "transfermate-beneficiaries",
        "transfermate-beneficiary.validation.ts"
      ),
      [
        "export function validateTransfermateBeneficiaryCountry() {",
        "  return 'beneficiary-country';",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(
        workingRoot,
        "src",
        "modules",
        "transfermate-bank-accounts",
        "transfermate-bank-account.validation.ts"
      ),
      [
        "export function validateTransfermateBankAccountNumberCountry() {",
        "  return 'account-number-country';",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(
        workingRoot,
        "src",
        "modules",
        "transfermate-bank-accounts",
        "dashboard-transfermate-bank-account.resolver.ts"
      ),
      [
        "import { validateTransfermateBankAccountNumberCountry } from './transfermate-bank-account.validation';",
        "export function dashboardTransfermateBankAccountResolver() {",
        "  return validateTransfermateBankAccountNumberCountry();",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "test", "modules", "transfermate-beneficiary.validation.spec.ts"),
      [
        "import { validateTransfermateBeneficiaryCountry } from '../../src/modules/transfermate-beneficiaries/transfermate-beneficiary.validation.ts';",
        "export function transfermateBeneficiaryValidationSpec() {",
        "  return validateTransfermateBeneficiaryCountry();",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "test", "modules", "transfermate-bank-account.validation.spec.ts"),
      [
        "import { validateTransfermateBankAccountNumberCountry } from '../../src/modules/transfermate-bank-accounts/transfermate-bank-account.validation.ts';",
        "export function transfermateBankAccountValidationSpec() {",
        "  return validateTransfermateBankAccountNumberCountry();",
        "}"
      ].join("\n")
    );

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const impacted = selectImpactedTests(
      runtime.paths.dbFile,
      "transfermate beneficiary validation account number country",
      5
    );

    assert.equal(impacted.tests[0].path, "test/modules/transfermate-beneficiary.validation.spec.ts");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
