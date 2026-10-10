import { describe, expect, it } from 'vitest'
import { resolveTarget } from './target'
import type { TimelineItem } from './model'

const item = (over: Partial<TimelineItem>): TimelineItem => ({ id: 'x', kind: 'tool', status: 'done', label: 'l', startedAt: 0, laneId: 's', ...over })
const ctx = (loaded: string[] = []) => ({ workspaceSlug: 'ws', sessionId: 'sess', blockInPage: (a: string) => loaded.includes(a) })

describe('resolveTarget', () => {
  it('scrolls to a block that is loaded', () => {
    expect(resolveTarget(item({ anchorId: 'c1' }), ctx(['c1']))).toEqual({ type: 'scroll', anchorId: 'c1' })
  })
  it('opens the timeline page when the block is not in the loaded window, instead of doing nothing', () => {
    expect(resolveTarget(item({ id: 'c1', anchorId: 'c1' }), ctx())).toEqual({ type: 'navigate', to: '/workspace/ws/chat/sess/timeline?item=c1' })
  })
  it('sends plans, tasks and steps to their pages', () => {
    expect(resolveTarget(item({ id: 'p', kind: 'plan' }), ctx()).type === 'navigate' && resolveTarget(item({ id: 'p', kind: 'plan' }), ctx())).toMatchObject({ to: '/workspace/ws/plans/p' })
    expect(resolveTarget(item({ id: 't', kind: 'task' }), ctx())).toMatchObject({ to: '/workspace/ws/tasks/t' })
    expect(resolveTarget(item({ id: 's', kind: 'step', parentId: 't' }), ctx())).toMatchObject({ to: '/workspace/ws/tasks/t' })
  })
  it('opens a detached run as its own conversation', () => {
    expect(resolveTarget(item({ kind: 'run', sessionId: 'child' }), ctx())).toMatchObject({ to: '/workspace/ws/chat/child' })
  })
  it('sends a request or a routing decision to its detail, with the id encoded', () => {
    expect(resolveTarget(item({ id: 'routing:a b', kind: 'routing' }), ctx())).toMatchObject({ to: '/workspace/ws/chat/sess/timeline?item=routing%3Aa%20b' })
  })
  it('from the timeline page itself, opens the conversation where it happened', () => {
    expect(resolveTarget(item({ id: 'c', laneId: 'child' }), { ...ctx(), fallback: 'conversation' as const })).toMatchObject({ to: '/workspace/ws/chat/child' })
  })
})
