import test from "node:test";
import assert from "node:assert/strict";
import { parseArgv } from "../src/core/argv.js";

test("parseArgv exposes kebab-case flags in camelCase form", () => {
  const parsed = parseArgv([
    "fix",
    "task name",
    "--rollback-on-fail",
    "--fail-under",
    "0.75",
    "--root",
    "."
  ]);

  assert.deepEqual(parsed.positionals, ["fix", "task name"]);
  assert.equal(parsed.flags["rollback-on-fail"], true);
  assert.equal(parsed.flags.rollbackOnFail, true);
  assert.equal(parsed.flags["fail-under"], "0.75");
  assert.equal(parsed.flags.failUnder, "0.75");
  assert.equal(parsed.flags.root, ".");
});
