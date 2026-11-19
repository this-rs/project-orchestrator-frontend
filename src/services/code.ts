import { api, buildQuery, ApiError, NonJsonResponseError } from './api'
import type {
  FunctionNode,
  StructNode,
  TraitNode,
  CodeCommunities,
  CodeHealth,
  NodeImportance,
  HotspotsResponse,
  KnowledgeGapsResponse,
  RiskAssessmentResponse,
  ClassHierarchy,
  SubclassesResponse,
  InterfaceImplementorsResponse,
  ProcessesResponse,
  EntryPointsResponse,
} from '@/types'

export interface SearchDocument {
  id: string
  path: string
  language: string
  docstrings?: string
  signatures?: string[]
  symbols?: string[]
  imports?: string[]
  project_id?: string
  project_slug?: string
}

export interface SearchResult {
  document: SearchDocument
  score: number
}

interface FileSymbols {
  functions: FunctionNode[]
  structs: StructNode[]
  traits: TraitNode[]
}

interface FileDependencies {
  imports: string[]
  dependents: string[]
}

interface CallGraphNode {
  name: string
  file_path: string
  calls: string[]
  called_by: string[]
}

export interface ImpactAnalysis {
  direct_dependents: string[]
  transitive_dependents: string[]
  affected_tests: string[]
  risk_score: number
  /**
   * Set on the empty result of a target the code graph does not know (the
   * backend answers 404 `file not found in graph`). Empty lists alone read as
   * "no impact": this flag says the file was never analysed.
   */
  not_in_graph?: boolean
}

export interface ArchitectureOverview {
  total_files: number
  key_files: { path: string; dependents: number; imports: number }[]
  languages: {
    language: string
    file_count: number
    function_count: number
    struct_count: number
  }[]
  modules: { path: string; files: number; public_api: string[] }[]
  orphan_files: string[]
}

/**
 * The backend's error sentence: `ApiError.message` carries the raw body,
 * `{"error": "..."}`. A body that is not that JSON is read as is.
 */
function backendErrorText(message: string): string {
  try {
    const body: unknown = JSON.parse(message)
    if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
      return (body as { error: string }).error
    }
  } catch {
    // not JSON: the message is the sentence
  }
  return message
}

/**
 * The one 404 that means "this target is not in the code graph": the backend
 * sentence starts with `file not found in graph:`. Every other 404 keeps
 * throwing — in particular:
 * - `file not found in graph for this project: … is a file of the graph, but
 *   not of this project`: the file IS in the graph, under another project.
 *   Showing "no impact" would hide a wrong target;
 * - an HTML 404 ([`NonJsonResponseError`]: a proxy that does not route `/api`,
 *   a static-file fallback, a login portal), which a bare `status === 404`
 *   test would turn into an empty graph, silently, on a misrouted deployment.
 */
function isUnknownGraphTarget(error: unknown): boolean {
  if (!(error instanceof ApiError) || error instanceof NonJsonResponseError || error.status !== 404) {
    return false
  }
  const text = backendErrorText(error.message).trim()
  return /^file not found in graph:/i.test(text) && !/not of this project/i.test(text)
}

export const codeApi = {
  // Search
  search: (query: string, params: { language?: string; limit?: number; project_slug?: string; workspace_slug?: string } = {}) =>
    api.get<SearchResult[]>(`/code/search${buildQuery({ query, ...params })}`),

  searchInProject: (
    projectSlug: string,
    query: string,
    params: { language?: string; limit?: number } = {}
  ) =>
    api.get<SearchResult[]>(
      `/projects/${projectSlug}/code/search${buildQuery({ query, ...params })}`
    ),

  // Symbols
  getFileSymbols: (filePath: string) =>
    api.get<FileSymbols>(`/code/symbols/${encodeURIComponent(filePath)}`),

  findReferences: (symbol: string, limit?: number) =>
    api.get<{ items: { file_path: string; line: number; context: string }[] }>(
      `/code/references${buildQuery({ symbol, limit })}`
    ),

  // Dependencies
  getFileDependencies: (filePath: string) =>
    api.get<FileDependencies>(`/code/dependencies/${encodeURIComponent(filePath)}`),

  // Call graph
  getCallGraph: (functionName: string, limit?: number) =>
    api.get<{ nodes: CallGraphNode[] }>(`/code/callgraph${buildQuery({ function: functionName, limit })}`),

  // Impact analysis. A target the graph does not know is an empty result, not
  // an error, flagged `not_in_graph` (no widget reads the flag yet: an unknown
  // target still renders as "no impact", never as a broken page). Only the
  // graph's OWN 404 is read that way — see `isUnknownGraphTarget`.
  analyzeImpact: async (target: string): Promise<ImpactAnalysis> => {
    try {
      return await api.get<ImpactAnalysis>(`/code/impact${buildQuery({ target })}`)
    } catch (error) {
      if (isUnknownGraphTarget(error)) {
        return {
          direct_dependents: [],
          transitive_dependents: [],
          affected_tests: [],
          risk_score: 0,
          not_in_graph: true,
        }
      }
      throw error
    }
  },

  // Architecture
  getArchitecture: (params: { project_slug?: string; workspace_slug?: string } = {}) =>
    api.get<ArchitectureOverview>(`/code/architecture${buildQuery(params)}`),

  // Similar code
  findSimilarCode: (snippet: string, limit?: number) =>
    api.post<{ items: SearchResult[] }>('/code/similar', { snippet, limit }),

  // Traits & Implementations
  findTraitImplementations: (traitName: string, limit?: number) =>
    api.get<{ items: { type_name: string; file_path: string; line: number }[] }>(
      `/code/trait-impls${buildQuery({ trait_name: traitName, limit })}`
    ),

  findTypeTraits: (typeName: string, limit?: number) =>
    api.get<{ items: { trait_name: string; file_path: string; line: number }[] }>(
      `/code/type-traits${buildQuery({ type_name: typeName, limit })}`
    ),

  getImplBlocks: (typeName: string, limit?: number) =>
    api.get<{ items: { file_path: string; line_start: number; line_end: number; methods: string[] }[] }>(
      `/code/impl-blocks${buildQuery({ type_name: typeName, limit })}`
    ),

  // ── Structural Analytics ──────────────────────────────────────────────

  getCommunities: (params: { project_slug: string; min_size?: number }) =>
    api.get<CodeCommunities>(`/code/communities${buildQuery(params)}`),

  getHealth: (params: { project_slug: string; god_function_threshold?: number }, signal?: AbortSignal) =>
    api.get<CodeHealth>(`/code/health${buildQuery(params)}`, signal),

  getNodeImportance: (params: { project_slug: string; node_path: string; node_type?: string }) =>
    api.get<NodeImportance>(`/code/node-importance${buildQuery(params)}`),

  getHotspots: (params: { project_slug: string; limit?: number }) =>
    api.get<HotspotsResponse>(`/code/hotspots${buildQuery(params)}`),

  getKnowledgeGaps: (params: { project_slug: string; limit?: number }) =>
    api.get<KnowledgeGapsResponse>(`/code/knowledge-gaps${buildQuery(params)}`),

  getRiskAssessment: (params: { project_slug: string; limit?: number }) =>
    api.get<RiskAssessmentResponse>(`/code/risk-assessment${buildQuery(params)}`),

  // ── Heritage Navigation ───────────────────────────────────────────────

  getClassHierarchy: (params: { type_name: string; max_depth?: number }) =>
    api.get<ClassHierarchy>(`/code/class-hierarchy${buildQuery(params)}`),

  findSubclasses: (params: { class_name: string }) =>
    api.get<SubclassesResponse>(`/code/subclasses${buildQuery(params)}`),

  findInterfaceImplementors: (params: { interface_name: string }) =>
    api.get<InterfaceImplementorsResponse>(`/code/interface-implementors${buildQuery(params)}`),

  // ── Process Detection ─────────────────────────────────────────────────

  detectProcesses: (data: { project_slug: string }) =>
    api.post('/code/processes/detect', data),

  listProcesses: (params: { project_slug: string }) =>
    api.get<ProcessesResponse>(`/code/processes${buildQuery(params)}`),

  getProcessDetail: (params: { process_id: string }) =>
    api.get(`/code/processes/detail${buildQuery(params)}`),

  getEntryPoints: (params: { project_slug: string; limit?: number }) =>
    api.get<EntryPointsResponse>(`/code/entry-points${buildQuery(params)}`),

  // ── Community Enrichment & Implementation Planner ─────────────────────

  enrichCommunities: (data: { project_slug: string }) =>
    api.post<CodeCommunities>('/code/communities/enrich', data),

  planImplementation: (data: {
    project_slug: string
    description: string
    entry_points?: string[]
    scope?: string
    auto_create_plan?: boolean
  }) => api.post('/code/plan-implementation', data),
}
