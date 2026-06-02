import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { scanRepository } from "../src/core/scanner.js";

const fixtureRoot = path.resolve("test/fixtures/sample-repo");
const playgroundRoot = path.resolve("playgrounds/react-nest-demo");

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

test("scanner extracts TypeScript class methods and resolves method calls across imported services", async () => {
  const result = await scanRepository(playgroundRoot);
  const fileMap = new Map(result.files.map((file) => [file.path, file]));

  const pricingService = fileMap.get("apps/api/src/checkout/pricing.service.ts");
  assert.ok(pricingService, "pricing service should be indexed");
  assert.ok(
    pricingService.symbols.some((symbol) => symbol.name === "calculateDiscount" && symbol.kind === "method"),
    "pricing service should expose calculateDiscount as a method symbol"
  );

  const checkoutService = fileMap.get("apps/api/src/checkout/checkout.service.ts");
  assert.ok(checkoutService, "checkout service should be indexed");
  assert.ok(
    checkoutService.calls.some((entry) =>
      entry.specifier === "calculateDiscount" && entry.targetPath === "apps/api/src/checkout/pricing.service.ts"
    ),
    "checkout service should resolve calculateDiscount to pricing.service.ts"
  );
  assert.ok(
    checkoutService.calls.some((entry) =>
      entry.specifier === "findCoupon" && entry.targetPath === "apps/api/src/checkout/coupon.service.ts"
    ),
    "checkout service should resolve findCoupon to coupon.service.ts"
  );
});
