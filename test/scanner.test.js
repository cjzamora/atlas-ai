import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { scanRepository } from "../src/core/scanner.js";

const fixtureRoot = path.resolve("test/fixtures/sample-repo");
const tsFixtureRoot = path.resolve("test/fixtures/ts-graph-sample");
const webFixtureRoot = path.resolve("playgrounds/holdout-web-dashboard");

test("scanner extracts symbols, imports, calls, and test relationships", async () => {
  const result = await scanRepository(fixtureRoot);
  const fileMap = new Map(result.files.map((file) => [file.path, file]));

  const intakeService = fileMap.get("src/services/intake.js");
  assert.ok(intakeService, "intake service should be indexed");
  assert.ok(intakeService.symbols.some((symbol) => symbol.name === "applyTicket"));
  assert.ok(intakeService.imports.some((entry) => entry.targetPath === "src/services/metering.js"));
  assert.ok(intakeService.calls.some((entry) => entry.targetPath === "src/services/metering.js"));

  const intakeTest = fileMap.get("test/services/intake.test.js");
  assert.ok(intakeTest, "intake test should be indexed");
  assert.ok(intakeTest.relationships.some((edge) => edge.edgeType === "tests" && edge.targetPath === "src/services/intake.js"));
});

test("scanner extracts TypeScript class methods and resolves method calls across imported services", async () => {
  const result = await scanRepository(tsFixtureRoot);
  const fileMap = new Map(result.files.map((file) => [file.path, file]));

  const areaCalculator = fileMap.get("src/area-calculator.ts");
  assert.ok(areaCalculator, "area calculator should be indexed");
  assert.ok(
    areaCalculator.symbols.some((symbol) => symbol.name === "rectangleArea" && symbol.kind === "method"),
    "area calculator should expose rectangleArea as a method symbol"
  );

  const shapeService = fileMap.get("src/shape-service.ts");
  assert.ok(shapeService, "shape service should be indexed");
  assert.ok(
    shapeService.calls.some((entry) =>
      entry.specifier === "rectangleArea" && entry.targetPath === "src/area-calculator.ts"
    ),
    "shape service should resolve rectangleArea to area-calculator.ts"
  );
  assert.ok(
    shapeService.calls.some((entry) =>
      entry.specifier === "rectanglePerimeter" && entry.targetPath === "src/perimeter-calculator.ts"
    ),
    "shape service should resolve rectanglePerimeter to perimeter-calculator.ts"
  );
});

test("scanner links HTML to its script/stylesheet assets and resolves CSS imports", async () => {
  const result = await scanRepository(webFixtureRoot);
  const fileMap = new Map(result.files.map((file) => [file.path, file]));

  const html = fileMap.get("index.html");
  assert.ok(html, "index.html should be indexed");
  assert.ok(
    html.imports.some((entry) => entry.targetPath === "scripts/dashboard.js"),
    "html should link its <script src> to the JS module"
  );
  assert.ok(
    html.imports.some((entry) => entry.targetPath === "styles/main.css"),
    "html should link its <link href> to the stylesheet"
  );

  const mainCss = fileMap.get("styles/main.css");
  assert.ok(mainCss, "main.css should be indexed");
  assert.ok(
    mainCss.imports.some((entry) => entry.targetPath === "styles/base.css"),
    "css @import should resolve to base.css"
  );
  assert.ok(
    mainCss.symbols.some((symbol) => symbol.name === "card"),
    "css class selectors should be extracted as symbols"
  );

  const themeScss = fileMap.get("styles/theme.scss");
  assert.ok(themeScss, "theme.scss should be indexed");
  assert.ok(
    themeScss.imports.some((entry) => entry.targetPath === "styles/base.css"),
    "scss @use should resolve across extensions to base.css"
  );
});
