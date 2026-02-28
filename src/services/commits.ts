import { api, buildQuery } from './api'
import type {
  Commit,
  CommitFile,
  FileHistoryEntry,
  CoChangeEdge,
  CoChanger,
} from '@/types'

export const commitsApi = {
  /** Register a new commit in the knowledge graph */
  create: (data: {
    sha: string
    message: string
    author: string
    files_changed?: string[]
    project_id?: string
  }) => api.post<Commit>('/commits', data),

  /** Get files changed by a specific commit */
  getCommitFiles: (commitSha: string) =>
    api.get<{ items: CommitFile[] }>(`/commits/${commitSha}/files`),

  /** Get commit history for a specific file */
  getFileHistory: (filePath: string, params?: { limit?: number }) =>
    api.get<{ items: FileHistoryEntry[] }>(
      `/files/history${buildQuery({ file_path: filePath, ...params })}`,
    ),

  /** Get the co-change graph for a project */
  getCoChangeGraph: (projectSlug: string) =>
    api.get<{ edges: CoChangeEdge[] }>(`/code/co-change-graph?project_slug=${encodeURIComponent(projectSlug)}`),

  /** Get files frequently changed together with a given file */
  getFileCoChangers: (filePath: string, params?: { limit?: number; min_count?: number }) =>
    api.get<{ items: CoChanger[] }>(
      `/code/file-co-changers${buildQuery({ file_path: filePath, ...params })}`,
    ),
}
