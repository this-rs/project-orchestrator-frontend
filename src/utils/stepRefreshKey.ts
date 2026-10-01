import type { Step } from '@/types'

/**
 * Changes whenever a step is added, removed, reordered or changes status.
 * Hashes the joined `id:status` pairs (a plain length sum collides, e.g.
 * pending vs skipped) into a number, as expected by `refreshTrigger`.
 */
export function computeStepRefreshKey(steps: Pick<Step, 'id' | 'status'>[]): number {
  const joined = steps.map((s) => `${s.id}:${s.status}`).join('|')
  let hash = 5381
  for (let i = 0; i < joined.length; i++) hash = ((hash * 33) ^ joined.charCodeAt(i)) | 0
  return hash >>> 0
}
