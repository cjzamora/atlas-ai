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
 */

export const atlasContracts = {};
