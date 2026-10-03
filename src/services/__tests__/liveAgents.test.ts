import { describe, expect, it, vi } from 'vitest'

const get = vi.fn()
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return { ...actual, api: { ...actual.api, get: (...a: unknown[]) => get(...a) } }
})

import { assertLiveAgents, liveAgentsApi } from '../liveAgents'

describe('liveAgentsApi', () => {
  it('reads /agents/live and returns the payload', async () => {
    const payload = { generated_at: 'x', agents: [], total: 0, waiting_input: 0, streaming: 0, idle: 0 }
    get.mockResolvedValueOnce(payload)
    const ctl = new AbortController()
    await expect(liveAgentsApi.list(ctl.signal)).resolves.toBe(payload)
    expect(get).toHaveBeenCalledWith('/agents/live', ctl.signal)
  })

  it.each([[null], [undefined], ['<html>'], [{}], [{ agents: 'nope' }], [[]]])(
    'refuses a reply that is not the contract (%j)',
    async (bad) => {
      get.mockResolvedValueOnce(bad)
      await expect(liveAgentsApi.list()).rejects.toThrow(/unexpected response shape/)
    },
  )

  it('assertLiveAgents accepts an empty agents array', () => {
    expect(() => assertLiveAgents({ agents: [] })).not.toThrow()
  })
})
