import { registerHandoffAdapter } from "./index.js";

export function buildCodexHandoff({ request }) {
  return {
    ok: true,
    status: "prepared",
    handoff: {
      provider: "codex",
      mode: "manual",
      target: "Codex",
      targetModel: request.model || "default",
      title: `Atlas handoff for Codex: ${request.task}`,
      instructions: [
        "Open Codex and start a new task in the target repository.",
        "Paste the Atlas prompt below as the initial instruction.",
        "Ask Codex to return a minimal unified diff and reference the selected tests."
      ],
      promptText: request.input?.promptText || request.prompt || "",
      selectedTests: request.context?.selectedTests || request.selectedTests || [],
      files: request.context?.files || request.files || []
    }
  };
}

registerHandoffAdapter("codex", buildCodexHandoff);
