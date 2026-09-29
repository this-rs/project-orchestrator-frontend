import { api } from './api'

export type ProgressKind = 'plan' | 'project' | 'milestone'

/** Task counters for one entity, as returned by `GET /api/progress`. */
export interface TaskCounts {
  total: number
  completed: number
  in_progress: number
  blocked: number
  pending: number
  failed: number
  /** 0–100, completed / total (0 when there is no task). */
  percentage: number
}

export const progressApi = {
  /** Counters for many entities in one round trip (max 200 ids). */
  batch: (kind: ProgressKind, ids: string[]) =>
    api.get<Record<string, TaskCounts>>(`/progress?kind=${kind}&ids=${ids.join(',')}`),
}
