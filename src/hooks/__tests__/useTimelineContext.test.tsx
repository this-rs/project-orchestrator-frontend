import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const getSession = vi.fn()
const decisions = vi.fn()
const getTask = vi.fn()
const listSteps = vi.fn()
const getPlan = vi.fn()

vi.mock('@/services', () => ({
  chatApi: { getSession: (...a: unknown[]) => getSession(...a) },
  tasksApi: { get: (...a: unknown[]) => getTask(...a), listSteps: (...a: unknown[]) => listSteps(...a) },
  plansApi: { get: (...a: unknown[]) => getPlan(...a) },
}))
vi.mock('@/services/routing', () => ({ routingApi: { decisions: (...a: unknown[]) => decisions(...a) } }))

import { useTimelineContext } from '../useTimelineContext'

const session = {
  id: 's', title: 'My chat', project_slug: 'po', provider_id: 'native', model: 'deepseek-chat', routed_by: 'auto',
  linked_tasks: [{ id: 't', title: 'Task', source: 'runner' }], linked_plans: [{ id: 'p', title: 'Plan', source: 'runner' }],
}

beforeEach(() => {
  vi.clearAllMocks()
  getSession.mockResolvedValue(session)
  decisions.mockResolvedValue([{ id: 'd1', session_id: 's' }, { id: 'd2', session_id: 'other' }])
  getTask.mockResolvedValue({ status: 'in_progress', plan_id: 'p', created_at: '2026-10-08T10:00:00Z' })
  listSteps.mockResolvedValue([{ id: 'st', description: 'do', status: 'pending', order: 1 }])
  getPlan.mockResolvedValue({ status: 'in_progress' })
})

describe('useTimelineContext', () => {
  it('gathers the session context, only its own decisions and the plan → task → step graph', async () => {
    const { result } = renderHook(() => useTimelineContext('s'))
    await waitFor(() => expect(result.current.session?.provider).toBe('native'))
    expect(result.current.session).toMatchObject({ model: 'deepseek-chat', routedBy: 'auto' })
    expect(result.current.decisions.map((d) => d.id)).toEqual(['d1'])
    expect(result.current.work.tasks[0]).toMatchObject({ id: 't', status: 'in_progress', planId: 'p' })
    expect(result.current.work.tasks[0].steps).toHaveLength(1)
    expect(result.current.work.plans[0]).toMatchObject({ id: 'p', status: 'in_progress' })
    expect(decisions).toHaveBeenCalledWith({ project_slug: 'po', limit: 200 })
  })

  it('keeps what it can when a piece fails: no routing route, a deleted task', async () => {
    decisions.mockRejectedValue(new Error('404'))
    getTask.mockRejectedValue(new Error('gone'))
    listSteps.mockRejectedValue(new Error('gone'))
    const { result } = renderHook(() => useTimelineContext('s'))
    await waitFor(() => expect(result.current.session?.provider).toBe('native'))
    expect(result.current.decisions).toEqual([])
    expect(result.current.work.tasks[0]).toMatchObject({ id: 't', status: 'pending', steps: [] })
  })

  it('stays empty without a session id and never calls the server', async () => {
    const { result } = renderHook(() => useTimelineContext(null))
    expect(result.current.decisions).toEqual([])
    expect(getSession).not.toHaveBeenCalled()
  })
})
