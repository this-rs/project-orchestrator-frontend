/**
 * Contract of `PUT /api/chat/sessions/{id}/routing` (backend #638): path, body of each
 * gesture of the routing menu, and how a refusal is read.
 *
 * Run with: npx vitest run src/services/__tests__/conversationRouting.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const put = vi.fn()
vi.mock('../api', async (orig) => ({
  ...(await orig<typeof import('../api')>()),
  api: { put: (...a: unknown[]) => put(...a) },
}))

import { ApiError } from '../api'
import { changeConversationRouting, conversationRoutingRefusal } from '../chat'

describe('changeConversationRouting', () => {
  beforeEach(() => put.mockReset().mockResolvedValue({ id: 's1', routing_mode: 'full' }))

  it('Auto: PUT {auto: true} on the session, and answers the session', async () => {
    await expect(changeConversationRouting('s1', { auto: true })).resolves.toEqual({ id: 's1', routing_mode: 'full' })
    expect(put).toHaveBeenCalledWith('/chat/sessions/s1/routing', { auto: true })
  })

  it('ticked models: PUT {auto: false, routing_pool}', async () => {
    const routing_pool = [
      { provider: 'local', model: 'qwen' },
      { provider: 'local', model: 'phi' },
    ]
    await changeConversationRouting('s1', { auto: false, routing_pool })
    expect(put).toHaveBeenCalledWith('/chat/sessions/s1/routing', { auto: false, routing_pool })
  })
})

describe('conversationRoutingRefusal', () => {
  const body = (code: string) => new ApiError(400, JSON.stringify({ error: 'x', code, retryable: false }))
  it('reads the typed 400 codes, 404 and 403', () => {
    expect(conversationRoutingRefusal(body('routing_pool_other_provider'))).toBe('routing_pool_other_provider')
    expect(conversationRoutingRefusal(body('invalid_routing_pool'))).toBe('invalid_routing_pool')
    expect(conversationRoutingRefusal(new ApiError(404, 'Session s1 not found'))).toBe('not_found')
    expect(conversationRoutingRefusal(new ApiError(403, 'only a signed-in user'))).toBe('forbidden')
  })
  it('anything else is the generic refusal, never an invented code', () => {
    expect(conversationRoutingRefusal(body('something_else'))).toBe('failed')
    expect(conversationRoutingRefusal(new ApiError(500, '<html>'))).toBe('failed')
    expect(conversationRoutingRefusal(new Error('offline'))).toBe('failed')
  })
})
