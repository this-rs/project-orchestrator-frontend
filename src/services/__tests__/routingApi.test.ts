/**
 * Contract of the cognitive routing routes: method, path and body of each,
 * and how their answers are read. The backend routes are being written in
 * parallel (B-R1) — this file states what the interface assumes of them.
 *
 * Run with: npx vitest run src/services/__tests__/routingApi.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const get = vi.fn()
const put = vi.fn()
const del = vi.fn()
vi.mock('../api', async (orig) => ({
  ...(await orig<typeof import('../api')>()),
  api: {
    get: (...a: unknown[]) => get(...a),
    put: (...a: unknown[]) => put(...a),
    delete: (...a: unknown[]) => del(...a),
  },
}))

import { ApiError } from '../api'
import { normalizeRoutingDecisions, normalizeRoutingSettings, routingApi, routingErrorCode } from '../routing'
import { normalizeProvidersResponse } from '../providers'
import type { RoutingSettings } from '@/types/routing'

const SETTINGS: RoutingSettings = {
  mode: 'mixed',
  stage: 'shadow',
  primary: { provider: 'claude-code', model: null, alias: 'deep' },
  exploration_epsilon: 0.1,
  cost_weight: 0.3,
  latency_weight: 0.1,
  demote_after: 20,
}

const WIRE_SETTINGS = { ...SETTINGS, scope: 'global' }

beforeEach(() => {
  for (const m of [get, put, del]) m.mockReset().mockResolvedValue(WIRE_SETTINGS)
})

describe('routingApi — global settings', () => {
  it('get — GET /chat/routing, reads the scope', async () => {
    const res = await routingApi.get()
    expect(get).toHaveBeenCalledWith('/chat/routing')
    expect(res).toEqual(WIRE_SETTINGS)
  })

  it('put — PUT /chat/routing with the settings as body', async () => {
    await routingApi.put(SETTINGS)
    expect(put).toHaveBeenCalledWith('/chat/routing', SETTINGS)
  })
})

describe('routingApi — project override', () => {
  it('getProject / putProject / deleteProject — /projects/{slug}/routing, slug encoded', async () => {
    await routingApi.getProject('my project')
    expect(get).toHaveBeenCalledWith('/projects/my%20project/routing')
    await routingApi.putProject('po', SETTINGS)
    expect(put).toHaveBeenCalledWith('/projects/po/routing', SETTINGS)
    del.mockResolvedValueOnce(undefined)
    await routingApi.deleteProject('po')
    expect(del).toHaveBeenCalledWith('/projects/po/routing')
  })

  it('getProject — a project without override answers the global settings with scope "global"', async () => {
    get.mockResolvedValueOnce({ ...WIRE_SETTINGS, scope: 'global' })
    expect((await routingApi.getProject('po')).scope).toBe('global')
    get.mockResolvedValueOnce({ ...WIRE_SETTINGS, scope: 'project' })
    expect((await routingApi.getProject('po')).scope).toBe('project')
  })
})

describe('routingApi — decisions and report', () => {
  it('decisions — GET /chat/routing/decisions with project_slug, limit and offset', async () => {
    get.mockResolvedValueOnce([])
    await routingApi.decisions({ project_slug: 'po', limit: 50, offset: 100 })
    expect(get).toHaveBeenCalledWith('/chat/routing/decisions?project_slug=po&limit=50&offset=100')
    get.mockResolvedValueOnce([])
    await routingApi.decisions()
    expect(get).toHaveBeenCalledWith('/chat/routing/decisions')
  })

  it('report — GET /chat/routing/report with project_slug, from and to', async () => {
    const report = { decisions: 0, applied: 0, agreement_rate: null, estimated_cost_delta_usd: null, by_class: [], by_arm: [] }
    get.mockResolvedValueOnce(report)
    const res = await routingApi.report({ project_slug: 'po', from: '2026-10-01T00:00:00Z', to: '2026-10-07T00:00:00Z' })
    expect(get).toHaveBeenCalledWith('/chat/routing/report?project_slug=po&from=2026-10-01T00%3A00%3A00Z&to=2026-10-07T00%3A00%3A00Z')
    expect(res).toEqual(report)
  })
})

describe('normalizeRoutingSettings', () => {
  it('keeps every field the backend sent', () => {
    expect(normalizeRoutingSettings(WIRE_SETTINGS)).toEqual(WIRE_SETTINGS)
  })

  it('falls back to primary / shadow / default on a value it does not know (the identity behaviour)', () => {
    const out = normalizeRoutingSettings({ mode: 'telepathy', stage: 'yolo', primary: null, scope: 'galaxy' })
    expect(out).toMatchObject({ mode: 'primary', stage: 'shadow', primary: null, scope: 'default' })
    expect(out.exploration_epsilon).toBe(0)
  })

  it('drops a primary without provider', () => {
    expect(normalizeRoutingSettings({ ...WIRE_SETTINGS, primary: { model: 'x' } }).primary).toBeNull()
  })

  it('rejects a body that is not an object', () => {
    expect(() => normalizeRoutingSettings('nope')).toThrow(/unexpected response/)
  })
})

describe('normalizeRoutingDecisions', () => {
  const decision = {
    id: 'd1',
    at: '2026-10-07T10:00:00Z',
    mode: 'full',
    stage: 'shadow',
    applied: false,
    task_class: 'simple',
    provider_id: 'local-llama',
    model: 'qwen2.5-coder-7b',
    score: 0.82,
    explored: false,
    reason: 'cheapest healthy arm of class simple',
    alternatives: [{ provider_id: 'deepseek', model: 'deepseek-chat', score: null, rejected: 'not_allowed' }],
    outcome: { success: null, reward: null, cost_usd: null },
  }

  it('reads a bare array and a paginated envelope alike', () => {
    expect(normalizeRoutingDecisions([decision])).toEqual([decision])
    expect(normalizeRoutingDecisions({ decisions: [decision], total: 1 })).toEqual([decision])
    expect(normalizeRoutingDecisions({ items: [decision] })).toEqual([decision])
  })

  it('drops entries without id or provider, and answers [] to anything else', () => {
    expect(normalizeRoutingDecisions([decision, { id: 'x' }, null, 'y'])).toEqual([decision])
    expect(normalizeRoutingDecisions(null)).toEqual([])
    expect(normalizeRoutingDecisions({ hello: 1 })).toEqual([])
  })
})

describe('routingErrorCode', () => {
  it.each(['invalid_routing_mode', 'invalid_learning_stage', 'invalid_routing_weight'])('reads a 400 %s', (code) => {
    const err = new ApiError(400, JSON.stringify({ code, error: 'refused' }))
    expect(routingErrorCode(err)).toBe(code)
  })

  it('answers null for any other error (403 of an agent token, network failure)', () => {
    expect(routingErrorCode(new ApiError(403, JSON.stringify({ error: 'human token required' })))).toBeNull()
    expect(routingErrorCode(new ApiError(400, JSON.stringify({ code: 'invalid_request', error: 'x' })))).toBeNull()
    expect(routingErrorCode(new Error('offline'))).toBeNull()
  })
})

describe('GET /api/chat/providers → routing summary', () => {
  it('reads `routing { mode, stage, scope }`', () => {
    const res = normalizeProvidersResponse({ providers: [], default_provider: null, routing: { mode: 'full', stage: 'advisory', scope: 'project' } })
    expect(res.routing).toEqual({ mode: 'full', stage: 'advisory', scope: 'project' })
  })

  it('leaves `routing` absent on a backend without the router, or on a value it does not know', () => {
    expect(normalizeProvidersResponse({ providers: [] }).routing).toBeUndefined()
    expect(normalizeProvidersResponse({ providers: [], routing: { mode: 'telepathy', stage: 'shadow' } }).routing).toBeUndefined()
  })
})
