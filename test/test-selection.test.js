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

test("impacted test selection prefers the directly-matched entity test over neighboring entity tests", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-test-entity-ranking-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.mkdir(path.join(workingRoot, "src", "modules", "session"), { recursive: true });
    await fs.mkdir(path.join(workingRoot, "src", "modules", "catalog"), { recursive: true });
    await fs.mkdir(path.join(workingRoot, "src", "modules", "registry"), { recursive: true });
    await fs.mkdir(path.join(workingRoot, "test", "modules"), { recursive: true });

    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "session", "session.core.ts"),
      [
        "export class SessionCore {",
        "  issueCurrentSessionToken() { return 'token'; }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "session", "session.gate.ts"),
      [
        "import { SessionCore } from './session.core';",
        "export class SessionGate {",
        "  constructor(private readonly sessions: SessionCore) {}",
        "  authorizeCurrentSession() { return this.sessions.issueCurrentSessionToken(); }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "catalog", "catalog.core.ts"),
      [
        "export class CatalogCore {",
        "  listCurrentCatalogItems() { return []; }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "src", "modules", "registry", "registry.core.ts"),
      [
        "export class RegistryCore {",
        "  listRegistryEntries() { return []; }",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "test", "modules", "session.core.spec.ts"),
      [
        "import { SessionCore } from '../../src/modules/session/session.core.ts';",
        "export function sessionCoreSpec() {",
        "  return new SessionCore().issueCurrentSessionToken();",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "test", "modules", "catalog.core.spec.ts"),
      [
        "import { CatalogCore } from '../../src/modules/catalog/catalog.core.ts';",
        "export function catalogCoreSpec() {",
        "  return new CatalogCore().listCurrentCatalogItems();",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "test", "modules", "registry.core.spec.ts"),
      [
        "import { RegistryCore } from '../../src/modules/registry/registry.core.ts';",
        "export function registryCoreSpec() {",
        "  return new RegistryCore().listRegistryEntries();",
        "}"
      ].join("\n")
    );

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const impacted = selectImpactedTests(runtime.paths.dbFile, "session token current authorize gate core", 5);
    assert.equal(impacted.tests[0].path, "test/modules/session.core.spec.ts");
    assert.equal(
      impacted.impactedFiles.some((filePath) => /(^|\/)(test|tests|__tests__)\//.test(filePath) || /\.(test|spec)\./.test(filePath)),
      false
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("impacted test selection prefers same-entity rules tests over neighboring rules tests", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-test-rules-entity-ranking-"));
  try {
    const workingRoot = path.join(tempRoot, "sample-repo");
    await fs.mkdir(path.join(workingRoot, "src", "modules", "directory-contacts"), { recursive: true });
    await fs.mkdir(path.join(workingRoot, "src", "modules", "directory-terminals"), { recursive: true });
    await fs.mkdir(path.join(workingRoot, "test", "modules"), { recursive: true });

    await fs.writeFile(
      path.join(
        workingRoot,
        "src",
        "modules",
        "directory-contacts",
        "directory-contact.rules.ts"
      ),
      [
        "export function checkDirectoryContactRegion() {",
        "  return 'contact-region';",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(
        workingRoot,
        "src",
        "modules",
        "directory-terminals",
        "directory-terminal.rules.ts"
      ),
      [
        "export function checkDirectoryTerminalAddressPortRegion() {",
        "  return 'address-port-region';",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(
        workingRoot,
        "src",
        "modules",
        "directory-terminals",
        "proxy-directory-terminal.gateway.ts"
      ),
      [
        "import { checkDirectoryTerminalAddressPortRegion } from './directory-terminal.rules';",
        "export function proxyDirectoryTerminalGateway() {",
        "  return checkDirectoryTerminalAddressPortRegion();",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "test", "modules", "directory-contact.rules.spec.ts"),
      [
        "import { checkDirectoryContactRegion } from '../../src/modules/directory-contacts/directory-contact.rules.ts';",
        "export function directoryContactRulesSpec() {",
        "  return checkDirectoryContactRegion();",
        "}"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(workingRoot, "test", "modules", "directory-terminal.rules.spec.ts"),
      [
        "import { checkDirectoryTerminalAddressPortRegion } from '../../src/modules/directory-terminals/directory-terminal.rules.ts';",
        "export function directoryTerminalRulesSpec() {",
        "  return checkDirectoryTerminalAddressPortRegion();",
        "}"
      ].join("\n")
    );

    const runtime = await ensureAtlasRuntime(workingRoot);
    const scan = await scanRepository(workingRoot);
    upsertFiles(runtime.paths.dbFile, scan.files);

    const impacted = selectImpactedTests(
      runtime.paths.dbFile,
      "directory contact rules address port region",
      5
    );

    assert.equal(impacted.tests[0].path, "test/modules/directory-contact.rules.spec.ts");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
