import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

type Ev = Record<string, unknown>
const histories = vi.hoisted(() => new Map<string, Ev[]>())
const tree = vi.hoisted(() => ({ nodes: [] as unknown[] }))
const failing = vi.hoisted(() => new Set<string>())
vi.mock('@/services/chat', () => ({
  chatApi: {
    getSession: vi.fn(async (id: string) => ({ id, title: `title ${id}`, provider_id: id === 'old' ? 'native' : 'claude-code', model: 'm', created_at: '2026-10-10T12:00:00Z' })),
    getSessionTree: vi.fn(async () => tree.nodes),
    getMessages: vi.fn(async (id: string, { offset = 0, limit = 50 }: { offset?: number; limit?: number }) => {
      if (failing.has(id)) throw new Error('boom')
      const all = histories.get(id) ?? []
      return { messages: all.slice(offset, offset + limit), total_count: all.length, has_more: offset + limit < all.length, offset, limit }
    }),
  },
}))

import { chatApi } from '@/services/chat'
import { useConversationTrace, TRACE_PAGE_SIZE } from './useConversationTrace'

const T = 1_791_000_000
/** A history of `turns` turns of one call each: user_message, tool_use, tool_result. */
function turns(n: number, prefix: string, extra: Ev[] = []): Ev[] {
  const out: Ev[] = [...extra]
  for (let i = 0; i < n; i += 1) {
    out.push({ type: 'user_message', id: `${prefix}u${i}`, content: `turn ${i}`, created_at: T + i * 10 })
    out.push({ type: 'tool_use', id: `${prefix}t${i}`, tool: 'Bash', input: { command: 'ls' }, created_at: T + i * 10 + 1 })
    out.push({ type: 'tool_result', id: `${prefix}t${i}`, result: 'ok', created_at: T + i * 10 + 2 })
  }
  return out.map((e, seq) => ({ ...e, seq }))
}

afterEach(() => {
  histories.clear()
  failing.clear()
  tree.nodes = []
  vi.clearAllMocks()
})

describe('useConversationTrace', () => {
  it('loads every page of the history down to the first message, saying how far it is', async () => {
    histories.set('root', turns(400, 'r')) // 1 200 events: three pages
    const { result } = renderHook(() => useConversationTrace('root'))
    expect(result.current.loading).toEqual({ loaded: 0, total: 0 })
    await waitFor(() => expect(result.current.loading).toBeNull())
    const root = result.current.sessions.find((s) => s.id === 'root')!
    expect(root.messages[0]!.role).toBe('user')
    expect(root.messages[0]!.blocks[0]!.content).toBe('turn 0')
    expect(root.messages.filter((m) => m.role === 'user')).toHaveLength(400)
    expect(vi.mocked(chatApi.getMessages).mock.calls.length).toBeGreaterThanOrEqual(Math.ceil(1200 / TRACE_PAGE_SIZE))
  })

  it('follows the relays and loads the child sessions, each linked to its parent', async () => {
    histories.set('old', turns(2, 'o', [{ type: 'conversation_relayed', from_session_id: 'old', to_session_id: 'root', from_provider: 'native', to_provider: 'claude-code' }]))
    histories.set('root', turns(2, 'r', [{ type: 'conversation_relayed', from_session_id: 'old', to_session_id: 'root', from_provider: 'native', to_provider: 'claude-code' }]))
    histories.set('kid', turns(1, 'k'))
    tree.nodes = [
      { session_id: 'root', depth: 0, is_streaming: false },
      { session_id: 'kid', parent_session_id: 'root', depth: 1, title: 'Delegated', is_streaming: false, created_at: '2026-10-10T12:00:00Z' },
    ]
    const { result } = renderHook(() => useConversationTrace('root'))
    await waitFor(() => expect(result.current.sessions).toHaveLength(3))
    await waitFor(() => expect(result.current.loading).toBeNull())
    const byId = Object.fromEntries(result.current.sessions.map((s) => [s.id, s]))
    expect(byId.old).toMatchObject({ relation: 'relay', provider: 'native' })
    expect(byId.kid).toMatchObject({ relation: 'child', parentId: 'root', title: 'Delegated' })
    expect(byId.kid!.messages.length).toBeGreaterThan(0)
  })

  it('says when a history could not be read, and retries', async () => {
    failing.add('root')
    const { result } = renderHook(() => useConversationTrace('root'))
    await waitFor(() => expect(result.current.failed).toBe(true))
    failing.clear()
    histories.set('root', turns(1, 'r'))
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.failed).toBe(false))
    await waitFor(() => expect(result.current.sessions[0]?.messages.length).toBeGreaterThan(0))
  })

  it('a retry reloads what failed and keeps what is on screen', async () => {
    histories.set('root', turns(2, 'r'))
    histories.set('kid', turns(1, 'k'))
    tree.nodes = [
      { session_id: 'root', depth: 0, is_streaming: false },
      { session_id: 'kid', parent_session_id: 'root', depth: 1, title: 'Delegated', is_streaming: false },
    ]
    failing.add('kid')
    const { result } = renderHook(() => useConversationTrace('root'))
    await waitFor(() => expect(result.current.failed).toBe(true))
    // The child that could not be read is not a lane with nothing in it.
    expect(result.current.sessions.map((s) => s.id)).toEqual(['root'])
    failing.clear()
    vi.mocked(chatApi.getMessages).mockClear()
    act(() => result.current.retry())
    // Same render as the retry: the root is still there.
    expect(result.current.sessions.map((s) => s.id)).toContain('root')
    await waitFor(() => expect(result.current.failed).toBe(false))
    expect(result.current.sessions.map((s) => s.id).sort()).toEqual(['kid', 'root'])
    // Only the child was asked again.
    expect(vi.mocked(chatApi.getMessages).mock.calls.every((c) => c[0] === 'kid')).toBe(true)
  })

  it('fetches only the new events while a turn streams', async () => {
    histories.set('root', turns(1, 'r'))
    const { result, rerender } = renderHook(({ key }) => useConversationTrace('root', { isStreaming: true, refreshKey: key }), { initialProps: { key: 1 } })
    await waitFor(() => expect(result.current.loading).toBeNull())
    histories.set('root', turns(2, 'r'))
    rerender({ key: 2 })
    await waitFor(() => expect(result.current.sessions[0]!.messages.filter((m) => m.role === 'user')).toHaveLength(2))
    const offsets = vi.mocked(chatApi.getMessages).mock.calls.map((c) => c[1]?.offset)
    expect(offsets).toContain(3)
    expect(result.current.streaming).toBe(true)
  })
})
