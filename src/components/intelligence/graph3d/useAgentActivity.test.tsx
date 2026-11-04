import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const setSessions = vi.fn()
let frameListener: ((sessionId: string, event: unknown) => void) | null = null
const unsubscribe = vi.fn()

vi.mock('@/services/eventBus', () => ({
  getEventBus: () => ({
    setSessions: (...a: unknown[]) => setSessions(...a),
    onChatFrame: (cb: (sessionId: string, event: unknown) => void) => {
      frameListener = cb
      return unsubscribe
    },
  }),
}))

import { subscribeEntityPulse } from '../livePulseBus'
import { useAgentActivity } from './useAgentActivity'

const OWNER = 'graph3d-agent-activity'

describe('useAgentActivity', () => {
  beforeEach(() => {
    setSessions.mockClear()
    unsubscribe.mockClear()
    frameListener = null
  })

  it('watches the sessions it is given, as a sorted, de-duplicated set', () => {
    renderHook(() => useAgentActivity(['s2', 's1', 's2']))
    expect(setSessions).toHaveBeenCalledWith(OWNER, ['s1', 's2'])
  })

  it('does not re-subscribe when the same set comes back in another order', () => {
    const { rerender } = renderHook(({ ids }) => useAgentActivity(ids), { initialProps: { ids: ['s1', 's2'] } })
    setSessions.mockClear()
    rerender({ ids: ['s2', 's1'] })
    expect(setSessions).not.toHaveBeenCalled()
  })

  it('gives the sessions back when it unmounts', () => {
    const { unmount } = renderHook(() => useAgentActivity(['s1']))
    setSessions.mockClear()
    unmount()
    expect(setSessions).toHaveBeenCalledWith(OWNER, [])
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('holds no subscription when disabled', () => {
    renderHook(() => useAgentActivity(['s1'], false))
    expect(setSessions).not.toHaveBeenCalled()
    expect(frameListener).toBeNull()
  })

  it('holds no subscription when nobody works', () => {
    renderHook(() => useAgentActivity([]))
    expect(setSessions).not.toHaveBeenCalled()
  })

  it('a tool call publishes its target on the pulse bus; other frames publish nothing', () => {
    const pulsed: string[][] = []
    const off = subscribeEntityPulse((ids) => pulsed.push([...ids]))
    renderHook(() => useAgentActivity(['s1']))
    frameListener?.('s1', { type: 'tool_use_input_resolved', tool: 'Read', category: 'read', input: { file_path: '/p/a.ts' } })
    frameListener?.('s1', { type: 'assistant_text', text: 'hello' })
    frameListener?.('s1', { type: 'tool_use_input_resolved', tool: 'Bash', category: 'command', input: { command: 'ls' } })
    off()
    expect(pulsed).toEqual([['/p/a.ts']])
  })
})
