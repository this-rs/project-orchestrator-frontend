import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CrudEvent } from '@/types'
import type { AttentionResponse } from '@/types/attention'

const get = vi.fn()
const post = vi.fn()
vi.mock('@/services/api', async () => {
  const actual = await vi.importActual<typeof import('@/services/api')>('@/services/api')
  return { ...actual, api: { ...actual.api, get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) } }
})

let emit: (e: CrudEvent) => void = () => {}
vi.mock('@/hooks/useEventBus', () => ({
  useEventBus: (cb: (e: CrudEvent) => void) => {
    emit = cb
  },
}))
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
vi.mock('@/hooks/useToast', () => ({ useToast: () => toast }))

import { ApiError } from '@/services/api'
import { ATTENTION_DEBOUNCE_MS, ORPHAN_NOTICE, applyOverlay, describeRequest, share, useAttention } from '../useAttention'
import { ROW_TEXT } from '@/components/today/ThreadRow'

const fixture = (name: string): AttentionResponse =>
  JSON.parse(readFileSync(join(__dirname, '../../services/__fixtures__/attention', `${name}.json`), 'utf8'))
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const changed = { entity_type: 'attention', action: 'updated', entity_id: 'x', payload: {}, timestamp: '' } as unknown as CrudEvent

/** `GET /plans/{id}` and `GET /projects` as the plan page reads them, on top of the attention payload. */
function mockPlanProject(planId: string) {
  const attention = clone(fixture('blocked_task'))
  get.mockImplementation(async (url: string) => {
    if (url === `/plans/${planId}`) return { id: planId, project_id: 'p-a' }
    if (url.startsWith('/projects')) return { items: [{ id: 'p-a', name: 'A', slug: 'proj-a', root_path: '/work/proj-a' }], total: 1 }
    return attention
  })
}

async function mount(name = 'four_bands', workspace?: string) {
  get.mockResolvedValue(clone(fixture(name)))
  const hook = renderHook(() => useAttention({ workspace }))
  await waitFor(() => expect(hook.result.current.status).toBe('ready'))
  return hook
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  Object.values(toast).forEach((f) => f.mockReset())
})
afterEach(() => vi.useRealTimers())

describe('useAttention: fetch', () => {
  it('loads a contract fixture, with the lane filter in the query', async () => {
    const { result } = await mount('four_bands', 'acme')
    expect(get.mock.calls[0][0]).toBe('/attention?workspace_slug=acme')
    expect(result.current.data!.waiting.map((w) => w.request_id)).toEqual(['req_p1', 'req_q1'])
  })

  it('has no query string without a lane', async () => {
    await mount('empty')
    expect(get.mock.calls[0][0]).toBe('/attention')
  })

  it('exposes an error state when the first load fails or the payload diverges from the contract', async () => {
    get.mockResolvedValue({ nope: true })
    const { result } = renderHook(() => useAttention())
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.data).toBeNull()
  })
})

describe('useAttention: attention_changed', () => {
  it('coalesces a burst into ONE refetch after the debounce', async () => {
    const { result } = await mount()
    vi.useFakeTimers()
    get.mockClear()
    act(() => {
      for (let i = 0; i < 6; i++) emit(changed)
    })
    await act(() => vi.advanceTimersByTimeAsync(ATTENTION_DEBOUNCE_MS - 1))
    expect(get).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(2))
    expect(get).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('ready')
  })

  it('a refresh request from a page (e.g. after "Rattacher à…") refetches the page ONCE, with the same debounce', async () => {
    const { getDefaultStore } = await import('jotai')
    const { attentionRefreshRequestAtom } = await import('@/atoms/attentionDigest')
    await mount()
    vi.useFakeTimers()
    get.mockClear()
    act(() => {
      getDefaultStore().set(attentionRefreshRequestAtom, (n) => n + 1)
      getDefaultStore().set(attentionRefreshRequestAtom, (n) => n + 1)
    })
    await act(() => vi.advanceTimersByTimeAsync(ATTENTION_DEBOUNCE_MS - 1))
    expect(get).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(2))
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('ignores unrelated events', async () => {
    await mount()
    vi.useFakeTimers()
    get.mockClear()
    act(() => emit({ entity_type: 'task', action: 'updated', entity_id: 'x', payload: {}, timestamp: '' }))
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(get).not.toHaveBeenCalled()
  })
})

describe('useAttention: refetch keeps the page', () => {
  it('never goes back to loading, keeps unchanged identities, local draft and expanded card', async () => {
    const { result } = await mount()
    act(() => {
      result.current.setDraft('req_q1', 'ma réponse en cours')
      result.current.toggleExpanded('req_q1')
    })
    const before = result.current.data!
    const next = clone(fixture('four_bands'))
    next.waiting[0].age_secs += 5
    let release!: (v: unknown) => void
    get.mockReturnValueOnce(new Promise((r) => (release = r)))
    let p!: Promise<void>
    act(() => {
      p = result.current.refresh()
    })
    expect(result.current.status).toBe('ready')
    expect(result.current.data).toBe(before)
    expect(result.current.refreshing).toBe(true)
    await act(async () => {
      release(next)
      await p
    })
    const after = result.current.data!
    expect(after.waiting[0].age_secs).toBe(before.waiting[0].age_secs + 5)
    expect(after.waiting[1]).toBe(before.waiting[1])
    expect(after.threads).toBe(before.threads)
    expect(result.current.drafts.req_q1).toBe('ma réponse en cours')
    expect(result.current.expanded.req_q1).toBe(true)
    expect(result.current.refreshing).toBe(false)
  })

  it('keeps the stale page when a refetch fails', async () => {
    const { result } = await mount()
    get.mockRejectedValueOnce(new Error('boom'))
    await act(() => result.current.refresh())
    expect(result.current.status).toBe('ready')
    expect(result.current.error?.message).toBe('boom')
    expect(result.current.data!.waiting).toHaveLength(2)
  })
})

describe('useAttention: optimistic mutations', () => {
  it('removes the item at once, then rolls back with an error toast when the server refuses', async () => {
    const { result } = await mount()
    const req = result.current.data!.waiting.find((w) => w.kind === 'permission')!
    let reject!: (e: Error) => void
    post.mockReturnValueOnce(new Promise((_, r) => (reject = r)))
    let p!: Promise<boolean>
    act(() => {
      p = result.current.answerPermission(req, true)
    })
    expect(result.current.data!.waiting.map((w) => w.request_id)).toEqual(['req_q1'])
    expect(post).toHaveBeenCalledWith(`/chat/sessions/${req.session_id}/permissions/req_p1`, { allow: true })
    await act(async () => {
      reject(new ApiError(500, 'nope'))
      await p
    })
    expect(result.current.data!.waiting.map((w) => w.request_id)).toContain('req_p1')
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('keeps the item gone on success (even if a stale refetch still lists it), toast.success', async () => {
    const { result } = await mount()
    const req = result.current.data!.waiting[1]
    post.mockResolvedValueOnce({})
    get.mockResolvedValueOnce(clone(fixture('four_bands'))) // server not yet caught up
    await act(async () => {
      await result.current.sendReply(req, 'oui')
    })
    expect(post).toHaveBeenCalledWith(`/chat/sessions/${req.session_id}/messages`, { content: 'oui' })
    expect(toast.success).toHaveBeenCalled()
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
  })

  it('drops the draft once the reply is sent, keeps it when it fails', async () => {
    const { result } = await mount()
    const req = result.current.data!.waiting[1]
    act(() => result.current.setDraft(req.request_id, 'brouillon'))
    post.mockRejectedValueOnce(new ApiError(500, 'x'))
    await act(async () => {
      await result.current.sendReply(req, 'brouillon')
    })
    expect(result.current.drafts[req.request_id]).toBe('brouillon')
    post.mockResolvedValueOnce({})
    await act(async () => {
      await result.current.sendReply(req, 'brouillon')
    })
    expect(result.current.drafts[req.request_id]).toBeUndefined()
  })

  it('moves a stuck thread out of its band on resume, and back on error', async () => {
    const { result } = await mount('blocked_task')
    const t = result.current.data!.threads[0]
    expect(t.band).toBe('stuck')
    post.mockRejectedValueOnce(new ApiError(409, 'busy'))
    let p!: Promise<boolean>
    act(() => {
      p = result.current.resumeRun(t)
    })
    expect(result.current.data!.threads[0].band).toBe('running')
    await act(async () => {
      await p
    })
    expect(result.current.data!.threads[0].band).toBe('stuck')
    expect(toast.error).toHaveBeenCalled()
  })

  it('resumes through the real route POST /plans/{id}/run, never an invented /run/resume', async () => {
    const { result } = await mount('blocked_task')
    const t = result.current.data!.threads[0]
    mockPlanProject(t.plan!.id)
    post.mockResolvedValueOnce({})
    await act(async () => {
      expect(await result.current.resumeRun(t)).toBe(true)
    })
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0][0]).toBe(`/plans/${t.plan!.id}/run`)
  })

  it('starts the run with the project folder and slug (the backend validates cwd), never cwd="."', async () => {
    const { result } = await mount('blocked_task')
    const t = result.current.data!.threads[0]
    mockPlanProject(t.plan!.id)
    post.mockResolvedValueOnce({})
    await act(async () => {
      await result.current.resumeRun(t)
    })
    expect(post.mock.calls[0][1]).toMatchObject({ cwd: '/work/proj-a', project_slug: 'proj-a' })
  })

  it('refuses to start a run (no POST) when the plan has no project folder', async () => {
    const { result } = await mount('blocked_task')
    const t = result.current.data!.threads[0]
    const base = get.getMockImplementation()
    get.mockImplementation(async (url: string) => {
      if (url === `/plans/${t.plan!.id}`) return { id: t.plan!.id }
      return base ? base(url) : clone(fixture('blocked_task'))
    })
    await act(async () => {
      expect(await result.current.resumeRun(t)).toBe(false)
    })
    expect(post).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalled()
  })

  it('never calls resume while the runner is busy', async () => {
    const { result } = await mount('runner_busy')
    const stuck = result.current.data!.threads.find((t) => t.band === 'stuck')!
    await act(async () => {
      expect(await result.current.resumeRun(stuck)).toBe(false)
    })
    expect(post).not.toHaveBeenCalled()
  })
})

describe('useAttention: 410 = orphan', () => {
  it('turns the permission into an orphan with a clear notice, no generic toast, and no more Allow', async () => {
    const { result } = await mount()
    const req = result.current.data!.waiting.find((w) => w.kind === 'permission')!
    post.mockRejectedValueOnce(new ApiError(410, 'gone'))
    get.mockResolvedValue(clone(fixture('four_bands'))) // server still lists it as waiting
    await act(async () => {
      expect(await result.current.answerPermission(req, true)).toBe('orphaned')
    })
    expect(toast.error).not.toHaveBeenCalled()
    expect(result.current.notices[req.request_id]).toBe(ORPHAN_NOTICE)
    expect(ORPHAN_NOTICE).toContain(ROW_TEXT.resumeSession) // names the button the user will actually see
    expect(ORPHAN_NOTICE).not.toContain('Continuer')
    expect(result.current.data!.waiting.some((w) => w.request_id === req.request_id)).toBe(false)
    expect(result.current.data!.orphans.some((o) => o.request_id === req.request_id)).toBe(true)
    post.mockClear()
    await act(async () => {
      expect(await result.current.answerPermission(req, true)).toBe('orphaned')
    })
    expect(post).not.toHaveBeenCalled()
  })
})

describe('applyOverlay / share', () => {
  it('is the identity without operations', () => {
    const d = fixture('four_bands')
    expect(applyOverlay(d, [])).toBe(d)
  })
  it('removes pending requests of unattached sessions', () => {
    const d = fixture('unattached_waiting')
    const u = d.unattached.find((x) => x.pending.length)
    if (!u) return
    const out = applyOverlay(d, [{ kind: 'drop_request', id: u.pending[0].request_id }])
    expect(out.unattached.find((x) => x.id === u.id)!.pending.map((r) => r.request_id)).not.toContain(u.pending[0].request_id)
  })
  it('share keeps identity of equal subtrees', () => {
    const a = { x: [{ k: 1 }, { k: 2 }], y: 'a' }
    const b = { x: [{ k: 1 }, { k: 3 }], y: 'a' }
    const s = share(a, b)
    expect(s.x[0]).toBe(a.x[0])
    expect(s.x[1]).toEqual({ k: 3 })
    expect(share(a, clone(a))).toBe(a)
  })
})

describe('describeRequest: a card that leaves is still named by its toast', () => {
  const req = (text: string, tool_name: string | null) => ({ text, tool_name }) as never
  it('says the tool and the start of the command, on one line', () => {
    expect(describeRequest(req('rm -rf\n  target/debug', 'Bash'))).toBe('Bash rm -rf target/debug')
  })
  it('cuts a long command and works without a tool name', () => {
    const out = describeRequest(req('x'.repeat(200), null))
    expect(out.length).toBeLessThanOrEqual(58)
    expect(out.endsWith('…')).toBe(true)
  })
})
