import { registerHandoffAdapter } from "./index.js";

export function buildClaudeHandoff({ request }) {
  return {
    ok: true,
    status: "prepared",
    handoff: {
      provider: "claude",
      mode: "manual",
      target: "Claude Code",
      targetModel: request.model || "default",
      title: `Atlas handoff for Claude Code: ${request.task}`,
      instructions: [
        "Open Claude Code in the target repository workspace.",
        "Paste the Atlas prompt below as the task request.",
        "Ask Claude Code for a minimal reviewable diff and to reference the selected tests."
      ],
      promptText: request.input?.promptText || request.prompt || "",
      selectedTests: request.context?.selectedTests || request.selectedTests || [],
      files: request.context?.files || request.files || []
    }
  };
}

registerHandoffAdapter("claude", buildClaudeHandoff);
