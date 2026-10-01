import { parseAttentionResponse } from '@/services/attention'
import type { AttentionResponse } from '@/types/attention'

/**
 * Demo data for the Today cockpit: `/today?demo=<name>` renders one of the shared
 * contract fixtures instead of calling `/api/attention`. Nothing is sent anywhere.
 * The fixtures are code-split (loaded only when a demo is asked for).
 *
 * Names: the file names of `services/__fixtures__/attention/` (without `.json`),
 * i.e. empty, one_band, four_bands, runner_busy, orphan, blocked_task,
 * forty_threads, multi_link, unattached_waiting, resumed_run.
 */
const loaders = import.meta.glob('../../services/__fixtures__/attention/*.json', { import: 'default' }) as Record<
  string,
  () => Promise<unknown>
>

const nameOf = (path: string) => path.replace(/^.*\//, '').replace(/\.json$/, '')

/** `enums.json` is a vocabulary, not a payload. */
export const DEMO_NAMES: string[] = Object.keys(loaders)
  .map(nameOf)
  .filter((n) => n !== 'enums')
  .sort()

export async function loadDemo(name: string): Promise<AttentionResponse> {
  const path = Object.keys(loaders).find((p) => nameOf(p) === name && name !== 'enums')
  if (!path) throw new Error(`Jeu de démo inconnu « ${name} ». Jeux : ${DEMO_NAMES.join(', ')}.`)
  return parseAttentionResponse(await loaders[path]())
}

/** Same cut as the server's `?workspace_slug=`, applied locally to a demo set. */
export function filterLane(data: AttentionResponse, lane: string | null): AttentionResponse {
  if (!lane) return data
  return {
    ...data,
    lanes: data.lanes.filter((l) => l.slug === lane),
    threads: data.threads.filter((t) => t.workspace === lane),
    waiting: data.waiting.filter((r) => r.workspace === lane),
    orphans: data.orphans.filter((r) => r.workspace === lane),
    thinking: data.thinking.filter((t) => t.workspace === lane),
    unattached: data.unattached.filter((u) => u.workspace_slug === lane),
  }
}
