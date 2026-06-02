import crypto from "node:crypto";

export function buildExecutionRequest({ task, classification, bundle, prompt, provider = "openai", model = "gpt-5.4" }) {
  return {
    requestId: crypto.createHash("sha1").update(`${task}:${prompt}`).digest("hex").slice(0, 12),
    provider,
    model,
    task,
    taskType: classification.taskType,
    risk: classification.risk,
    contextBudget: bundle.contextBudget,
    selectedTests: bundle.selectedTests,
    files: bundle.files.map((file) => ({
      path: file.path,
      role: file.role,
      symbol: file.symbol || null
    })),
    prompt
  };
}
