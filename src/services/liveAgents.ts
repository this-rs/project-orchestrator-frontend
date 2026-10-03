import { api } from './api'
import type { LiveAgentsResponse } from '@/types/liveAgents'

/**
 * A reply that is not the contract (an HTML page from a proxy, an older server
 * without the route answering something else) must be an error, not a list: the
 * screen would otherwise render it, or crash on it.
 */
export function assertLiveAgents(r: unknown): LiveAgentsResponse {
  const x = r as Partial<LiveAgentsResponse> | null
  if (!x || typeof x !== 'object' || !Array.isArray(x.agents)) {
    throw new Error('live agents: unexpected response shape')
  }
  return r as LiveAgentsResponse
}

export const liveAgentsApi = {
  /** Every agent whose CLI is running right now, whatever started it. */
  list: async (signal?: AbortSignal) =>
    assertLiveAgents(await api.get<unknown>('/agents/live', signal)),
}
