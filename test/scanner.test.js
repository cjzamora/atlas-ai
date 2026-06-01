import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { scanRepository } from "../src/core/scanner.js";

const fixtureRoot = path.resolve("test/fixtures/sample-repo");

test("scanner extracts symbols, imports, calls, and test relationships", async () => {
  const result = await scanRepository(fixtureRoot);
  const fileMap = new Map(result.files.map((file) => [file.path, file]));

  const checkoutService = fileMap.get("src/services/checkout.js");
  assert.ok(checkoutService, "checkout service should be indexed");
  assert.ok(checkoutService.symbols.some((symbol) => symbol.name === "applyCoupon"));
  assert.ok(checkoutService.imports.some((entry) => entry.targetPath === "src/services/pricing.js"));
  assert.ok(checkoutService.calls.some((entry) => entry.targetPath === "src/services/pricing.js"));

  const checkoutTest = fileMap.get("test/services/checkout.test.js");
  assert.ok(checkoutTest, "checkout test should be indexed");
  assert.ok(checkoutTest.relationships.some((edge) => edge.edgeType === "tests" && edge.targetPath === "src/services/checkout.js"));
});
