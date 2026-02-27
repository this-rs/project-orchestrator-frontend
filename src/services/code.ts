import { api, buildQuery } from './api'
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

interface ImpactAnalysis {
  direct_dependents: string[]
  transitive_dependents: string[]
  affected_tests: string[]
  risk_score: number
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

  // Impact analysis
  analyzeImpact: (target: string) =>
    api.get<ImpactAnalysis>(`/code/impact${buildQuery({ target })}`),

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

  getHealth: (params: { project_slug: string; god_function_threshold?: number }) =>
    api.get<CodeHealth>(`/code/health${buildQuery(params)}`),

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
