/**
 * Contract tests: request shapes the backend actually accepts.
 *
 * - `POST /api/protocols/runs/{id}/transition` deserializes
 *   `FireTransitionBody { trigger }` (backend protocol_handlers.rs). The client
 *   used to send `{ event }`, which axum rejects with 422.
 * - `POST /api/plans/{pid}/run/tasks/{tid}/retry` is the route behind the
 *   Retry button of a failed agent card (backend handlers::retry_plan_task).
 *
 * Run with: npx vitest run src/services/__tests__/apiContract.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const post = vi.fn()
const get = vi.fn()
vi.mock('../api', () => ({
  api: { post: (...a: unknown[]) => post(...a), get: (...a: unknown[]) => get(...a) },
  buildQuery: () => '',
}))

import { protocolApi } from '../protocolApi'
import { runnerApi } from '../runner'

beforeEach(() => {
  post.mockReset().mockResolvedValue({})
  get.mockReset().mockResolvedValue({})
})

describe('protocolApi.triggerEvent', () => {
  it('sends the transition name in a `trigger` field (not `event`)', async () => {
    await protocolApi.triggerEvent('run-1', 'approve')
    expect(post).toHaveBeenCalledTimes(1)
    const [url, body] = post.mock.calls[0]
    expect(url).toBe('/protocols/runs/run-1/transition')
    expect(body).toEqual({ trigger: 'approve' })
    expect(body).not.toHaveProperty('event')
  })
})

describe('protocolApi dead calls', () => {
  it('no longer exposes getRunHistory (no backend route, no caller)', () => {
    expect('getRunHistory' in protocolApi).toBe(false)
  })
})

describe('runnerApi.retryTask', () => {
  it('posts to the per-task retry route of the plan run', async () => {
    await runnerApi.retryTask('plan-1', 'task-9')
    expect(post).toHaveBeenCalledWith('/plans/plan-1/run/tasks/task-9/retry')
  })
})
