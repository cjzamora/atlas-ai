import { patchCommand } from "./patch.js";
import { testCommand } from "./test.js";

export async function fixCommand({ args, flags }) {
  const task = args.join(" ").trim();
  if (!task) {
    throw new Error('Usage: atlas fix "<task>"');
  }

  const stage = await patchCommand({
    args: ["stage", task],
    flags
  });

  if (!stage.ok || !stage.artifactId) {
    return {
      ok: false,
      command: "fix",
      task,
      status: "stage_failed",
      stage,
      validation: null,
      apply: null,
      artifact: stage.artifact || null
    };
  }

  const validation = await testCommand({
    args: ["run"],
    flags: { ...flags, artifact: stage.artifactId }
  });

  if (!validation.ok || validation.status !== "passed") {
    return {
      ok: false,
      command: "fix",
      task,
      status: "validation_failed",
      artifactId: stage.artifactId,
      stage,
      validation,
      apply: null,
      artifact: validation.artifact || null
    };
  }

  const apply = await patchCommand({
    args: ["apply", stage.artifactId],
    flags: { ...flags, confirm: true }
  });

  return {
    ok: apply.ok,
    command: "fix",
    task,
    artifactId: stage.artifactId,
    status: apply.status,
    stage,
    validation,
    apply,
    artifact: apply.artifact || null
  };
}
