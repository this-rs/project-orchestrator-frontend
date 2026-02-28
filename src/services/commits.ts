import { api, buildQuery } from './api'
import type { Commit } from '@/types'

// ── Backend raw types (before normalization) ────────────────────────────

interface RawCommitFile {
  path: string
  additions: number | null
  deletions: number | null
}

interface RawFileHistoryEntry {
  hash: string
  message: string
  author: string
  timestamp: string
  additions: number | null
  deletions: number | null
}

interface RawCoChangePair {
  file_a: string
  file_b: string
  count: number
  last_at?: string
}

interface RawCoChanger {
  path: string
  count: number
  last_at?: string
}

// ── Normalized frontend types ───────────────────────────────────────────

export interface CommitFile {
  file_path: string
  additions: number
  deletions: number
}

export interface FileHistoryEntry {
  commit_sha: string
  message: string
  author: string
  date: string
  additions: number
  deletions: number
}

export interface CoChangeEdge {
  file_a: string
  file_b: string
  co_change_count: number
  last_at?: string
}

export interface CoChanger {
  file_path: string
  co_change_count: number
  last_at?: string
}

// ── API ─────────────────────────────────────────────────────────────────

export const commitsApi = {
  /** Register a new commit in the knowledge graph */
  create: (data: {
    sha: string
    message: string
    author: string
    files_changed?: string[]
    project_id?: string
  }) => api.post<Commit>('/commits', data),

  /** Get files changed by a specific commit — backend returns CommitFileInfo[] with "path" */
  getCommitFiles: async (commitSha: string) => {
    const raw = await api.get<RawCommitFile[]>(`/commits/${commitSha}/files`)
    return {
      items: (raw || []).map((f) => ({
        file_path: f.path,
        additions: f.additions ?? 0,
        deletions: f.deletions ?? 0,
      })),
    }
  },

  /** Get commit history for a specific file — backend returns FileHistoryEntry[] with "hash" */
  getFileHistory: async (filePath: string, params?: { limit?: number }) => {
    const raw = await api.get<RawFileHistoryEntry[]>(
      `/files/history${buildQuery({ file_path: filePath, ...params })}`,
    )
    return {
      items: (raw || []).map((e) => ({
        commit_sha: e.hash,
        message: e.message,
        author: e.author,
        date: e.timestamp,
        additions: e.additions ?? 0,
        deletions: e.deletions ?? 0,
      })),
    }
  },

  /** Get the co-change graph for a project — backend: GET /projects/{id}/co-changes */
  getCoChangeGraph: async (projectId: string, params?: { min_count?: number; limit?: number }) => {
    const raw = await api.get<RawCoChangePair[]>(
      `/projects/${projectId}/co-changes${buildQuery(params || {})}`,
    )
    return {
      edges: (raw || []).map((e) => ({
        file_a: e.file_a,
        file_b: e.file_b,
        co_change_count: e.count,
        last_at: e.last_at,
      })),
    }
  },

  /** Get files frequently changed together — backend: GET /files/co-changers?path=... */
  getFileCoChangers: async (
    filePath: string,
    params?: { limit?: number; min_count?: number },
  ) => {
    const raw = await api.get<RawCoChanger[]>(
      `/files/co-changers${buildQuery({ path: filePath, ...params })}`,
    )
    return {
      items: (raw || []).map((c) => ({
        file_path: c.path,
        co_change_count: c.count,
        last_at: c.last_at,
      })),
    }
  },
}
