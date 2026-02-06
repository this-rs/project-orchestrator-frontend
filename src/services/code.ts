import { api, buildQuery } from './api'
import type { FunctionNode, StructNode, TraitNode } from '@/types'

interface SearchDocument {
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

interface SearchResult {
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

interface ArchitectureOverview {
  key_files: { path: string; dependents: number; imports: number }[]
  languages: { language: string; file_count: number }[]
}

export const codeApi = {
  // Search
  search: (query: string, params: { language?: string; limit?: number } = {}) =>
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
  getArchitecture: () => api.get<ArchitectureOverview>('/code/architecture'),

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
}
