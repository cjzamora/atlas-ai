/**
 * Atlas internal contracts for v0.
 *
 * @typedef {Object} TaskRequest
 * @property {string} request
 * @property {string} repoRoot
 * @property {"ask"|"plan"} mode
 * @property {Record<string, unknown>} [budgetHints]
 *
 * @typedef {Object} TaskClassification
 * @property {string} taskType
 * @property {"low"|"medium"|"high"} risk
 * @property {boolean} requiresTests
 * @property {string} contextBudget
 * @property {string} modelRecommendation
 *
 * @typedef {Object} RepoNode
 * @property {string} path
 * @property {string} language
 * @property {number} sizeBytes
 * @property {string} hash
 * @property {string} summary
 *
 * @typedef {Object} SymbolRecord
 * @property {string} filePath
 * @property {string} name
 * @property {string} kind
 *
 * @typedef {Object} RetrievalBundle
 * @property {Array<{path: string, language: string, summary: string, symbol?: string, score: number, relatedPaths?: string[], callHints?: string[], testPaths?: string[]}>} matches
 *
 * @typedef {Object} PlanArtifact
 * @property {string} summary
 * @property {string[]} likelyFiles
 * @property {string[]} relatedDependencies
 * @property {string[]} likelyTests
 * @property {string[]} selectedTests
 * @property {{mode: string, rationale: string, directTests: string[], expandedTests: string[], fallbackTests?: string[]}} validationStrategy
 * @property {string[]} callHints
 * @property {string[]} steps
 * @property {string[]} risks
 * @property {string[]} openQuestions
 * @property {boolean} codexNeeded
 *
 * @typedef {Object} ExecutionRequest
 * @property {number} schemaVersion
 * @property {string} requestId
 * @property {string} provider
 * @property {string} model
 * @property {string} task
 * @property {string} taskType
 * @property {string} risk
 * @property {{promptText: string}} input
 * @property {{contextBudget: string, selectedTests: string[], memoryHints: Array<Record<string, unknown>>, memoryAssistance: Record<string, unknown>, files: Array<{path: string, role: string, symbol: string | null}>}} context
 *
 * @typedef {Object} ExecutionResponse
 * @property {string | null} id
 * @property {string} provider
 * @property {string | null} status
 * @property {string | null} finishReason
 * @property {string} text
 *
 * @typedef {Object} ExecutionHandoff
 * @property {string} provider
 * @property {string} mode
 * @property {string} target
 * @property {string} targetModel
 * @property {string} title
 * @property {string[]} instructions
 * @property {string} promptText
 * @property {string[]} selectedTests
 * @property {Array<{path: string, role: string, symbol: string | null}>} files
 */

/**
 * Version of the persisted, operator-facing contracts (the execution request and
 * the patch artifact). Bump when a field is removed or its meaning changes;
 * purely additive fields do not require a bump. See docs/CONTRACTS.md.
 */
export const CONTRACT_VERSION = 1;

export const atlasContracts = {};
