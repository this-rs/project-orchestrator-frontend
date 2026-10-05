/**
 * Contract tests: request shapes the backend actually accepts.
 *
 * - `POST /api/protocols/runs/{id}/transition` deserializes
 *   `FireTransitionBody { trigger }` (backend protocol_handlers.rs). The client
 *   used to send `{ event }`, which axum rejects with 422.
 * - `POST /api/plans/{pid}/run/tasks/{tid}/retry` is the route behind the
 *   Retry button of a failed agent card (backend handlers::retry_plan_task).
 * - The environment / deployment routes (backend environment_handlers.rs): the
 *   UI writes them, so a wrong verb or path is a silent dead button.
 *
 * Run with: npx vitest run src/services/__tests__/apiContract.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const post = vi.fn()
const get = vi.fn()
const patch = vi.fn()
const del = vi.fn()
vi.mock('../api', () => ({
  api: {
    post: (...a: unknown[]) => post(...a),
    get: (...a: unknown[]) => get(...a),
    patch: (...a: unknown[]) => patch(...a),
    delete: (...a: unknown[]) => del(...a),
  },
  buildQuery: (params: Record<string, unknown>) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') q.append(k, String(v))
    }
    const s = q.toString()
    return s ? `?${s}` : ''
  },
}))

import { protocolApi } from '../protocolApi'
import { runnerApi } from '../runner'
import { environmentsApi } from '../environments'

beforeEach(() => {
  post.mockReset().mockResolvedValue({})
  get.mockReset().mockResolvedValue({})
  patch.mockReset().mockResolvedValue({})
  del.mockReset().mockResolvedValue(undefined)
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

describe('runnerApi.startRun', () => {
  it('sends the exact body it always did when no provider or model is chosen', async () => {
    await runnerApi.startRun('plan-1', '/repo', 'proj', 12)
    expect(post).toHaveBeenCalledWith('/plans/plan-1/run', {
      cwd: '/repo',
      triggered_by: 'manual',
      project_slug: 'proj',
      max_cost_usd: 12,
    })
    await runnerApi.startRun('plan-1', '/repo', undefined, undefined, { provider: null, model: null })
    expect(post).toHaveBeenLastCalledWith('/plans/plan-1/run', { cwd: '/repo', triggered_by: 'manual' })
  })

  it('adds provider, model and a token budget only when they are chosen', async () => {
    await runnerApi.startRun('plan-1', '/repo', 'proj', undefined, { provider: 'deepseek', model: 'fast', maxTokens: 500000 })
    expect(post).toHaveBeenCalledWith('/plans/plan-1/run', {
      cwd: '/repo',
      triggered_by: 'manual',
      project_slug: 'proj',
      provider: 'deepseek',
      model: 'fast',
      max_tokens: 500000,
    })
  })
})

describe('chatApi.interruptSession', () => {
  it('keeps the plain body and adds `cascade: true` only when asked', async () => {
    const { chatApi } = await import('../chat')
    await chatApi.interruptSession('s1')
    expect(post).toHaveBeenLastCalledWith('/chat/sessions/s1/interrupt', { scope: 'turn_and_tools' })
    await chatApi.interruptSession('s1', 'turn_and_tools', { cascade: true })
    expect(post).toHaveBeenLastCalledWith('/chat/sessions/s1/interrupt', { scope: 'turn_and_tools', cascade: true })
  })
})

describe('runnerApi.retryTask', () => {
  it('posts to the per-task retry route of the plan run', async () => {
    await runnerApi.retryTask('plan-1', 'task-9')
    expect(post).toHaveBeenCalledWith('/plans/plan-1/run/tasks/task-9/retry')
  })
})

describe('environmentsApi', () => {
  it('creates an environment under its project', async () => {
    await environmentsApi.create('p1', { name: 'production', kind: 'production', url: 'https://x.example' })
    expect(post).toHaveBeenCalledWith('/projects/p1/environments', {
      name: 'production',
      kind: 'production',
      url: 'https://x.example',
    })
  })

  it('patches and deletes an environment by its own id', async () => {
    await environmentsApi.update('e1', { description: '' })
    expect(patch).toHaveBeenCalledWith('/environments/e1', { description: '' })
    await environmentsApi.remove('e1')
    expect(del).toHaveBeenCalledWith('/environments/e1')
  })

  it('records a deployment on the environment, and settles it by deployment id', async () => {
    await environmentsApi.deploy('e1', { status: 'succeeded', version: 'v1' })
    expect(post).toHaveBeenCalledWith('/environments/e1/deployments', { status: 'succeeded', version: 'v1' })
    await environmentsApi.updateDeployment('d1', { status: 'failed' })
    expect(patch).toHaveBeenCalledWith('/deployments/d1', { status: 'failed' })
  })

  it('reads the deployment list as a paginated envelope, with pagination in the query', async () => {
    get.mockResolvedValueOnce({ items: [{ id: 'd1' }], total: 1, limit: 20, offset: 0 })
    const page = await environmentsApi.listDeployments('e1', { limit: 20 })
    expect(get).toHaveBeenCalledWith('/environments/e1/deployments?limit=20')
    expect(page.items).toHaveLength(1)
    expect(page.total).toBe(1)
  })

  it('asks for the whole list when no pagination is given', async () => {
    await environmentsApi.listDeployments('e1')
    expect(get).toHaveBeenCalledWith('/environments/e1/deployments')
  })
})
