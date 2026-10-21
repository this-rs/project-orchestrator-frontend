import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import type { CrudEvent } from '@/types'
import { ApiError } from '@/services/api'

const PLAN = '11111111-1111-4111-8111-111111111111'
const A = '00000000-0000-4000-8000-000000000001'
const B = '00000000-0000-4000-8000-000000000002'

const bus = vi.hoisted(() => {
  const listeners = new Set<(e: unknown) => void>()
  return {
    listeners,
    off: vi.fn(),
    connect: vi.fn(),
    on: vi.fn((fn: (e: unknown) => void) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
        bus.off()
      }
    }),
  }
})
const api = vi.hoisted(() => ({ get: vi.fn(), getDependencyGraph: vi.fn() }))

vi.mock('@/services', async (orig) => ({
  ...(await orig<typeof import('@/services')>()),
  plansApi: api,
  getEventBus: () => bus,
}))

import LivePlanViz from './LivePlanViz'
import { MarkdownText } from '../../MarkdownText'
import { IsoSceneFence } from './IsoSceneFence'
import { isoSceneFallback, parseLiveSpec } from './fence'

const emit = (e: Partial<CrudEvent>) => act(() => bus.listeners.forEach((fn) => fn({ payload: {}, timestamp: '2026-10-21T10:00:00Z', ...e })))

describe('LivePlanViz', () => {
  beforeEach(() => {
    bus.listeners.clear()
    vi.clearAllMocks()
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }))
    api.get.mockResolvedValue({ id: PLAN, title: 'Release', tasks: [{ id: A, completed_at: '2026-10-20T00:00:00Z' }, { id: B }] })
    api.getDependencyGraph.mockResolvedValue({
      nodes: [
        { id: A, title: 'Plan the release', status: 'completed' },
        { id: B, title: 'Build', status: 'pending' },
      ],
      edges: [{ from: B, to: A }],
    })
  })

  it('reads the plan, shows its tasks and statuses, follows the bus, unsubscribes on unmount', async () => {
    const { unmount } = render(<LivePlanViz data={{ live: { plan: PLAN } }} fallbackText="" />)
    const legend = await screen.findByTestId('live-plan-legend')
    expect(api.get).toHaveBeenCalledWith(PLAN)
    expect(api.getDependencyGraph).toHaveBeenCalledWith(PLAN)
    expect(legend.textContent).toContain('Plan the release')
    expect(legend.textContent).toContain('done')
    expect(legend.querySelector(`[data-status="planned"]`)?.textContent).toContain('Build')
    // No WebGL 2 in jsdom: the same machine as SVG.
    expect(await screen.findByTestId('iso-scene-svg')).toBeTruthy()
    expect(bus.on).toHaveBeenCalledTimes(1)

    emit({ entity_type: 'task', action: 'updated', entity_id: B, payload: { status: 'in_progress' } })
    await waitFor(() => expect(screen.getByTestId('live-plan-legend').querySelector('[data-status="building"]')?.textContent).toContain('in progress'))
    // Another plan's task: nothing moves.
    emit({ entity_type: 'task', action: 'updated', entity_id: '00000000-0000-4000-8000-000000000099', payload: { status: 'failed' } })
    expect(screen.getByTestId('live-plan-legend').querySelector('[data-status="failed"]')).toBeNull()

    unmount()
    expect(bus.off).toHaveBeenCalledTimes(1)
    expect(bus.listeners.size).toBe(0)
  })

  it('an unmount before the plan is read never subscribes', async () => {
    let resolve!: (v: unknown) => void
    api.get.mockReturnValue(new Promise((r) => (resolve = r)))
    const { unmount } = render(<LivePlanViz data={{ live: { plan: PLAN } }} fallbackText="" />)
    expect(screen.getByTestId('live-plan-loading')).toBeTruthy()
    unmount()
    await act(async () => resolve({ id: PLAN, title: 'x', tasks: [] }))
    expect(bus.on).not.toHaveBeenCalled()
  })

  it('an unknown plan: a readable refusal, no exception', async () => {
    api.get.mockRejectedValue(new ApiError(404, 'Plan not found'))
    render(<LivePlanViz data={{ live: { plan: PLAN } }} fallbackText="" />)
    expect((await screen.findByTestId('live-plan-refused')).textContent).toContain(`No plan ${PLAN}`)
    expect(bus.on).not.toHaveBeenCalled()
  })

  it('an unreadable plan (the server answers garbage): a readable refusal', async () => {
    api.getDependencyGraph.mockRejectedValue(new Error('boom'))
    render(<LivePlanViz data={{ live: { plan: PLAN } }} fallbackText="" />)
    expect((await screen.findByTestId('live-plan-refused')).textContent).toMatch(/could not be read \(boom\)/)
  })

  it('a malformed graph (no nodes) is an empty plan, not a crash', async () => {
    api.getDependencyGraph.mockResolvedValue({})
    render(<LivePlanViz data={{ live: { plan: PLAN } }} fallbackText="" />)
    expect(await screen.findByTestId('live-plan-empty')).toBeTruthy()
  })

  it('strict spec: a bad uuid or another field is refused before any read', () => {
    const { rerender } = render(<LivePlanViz data={{ live: { plan: 'not-a-uuid' } }} fallbackText="fb" />)
    expect(screen.getByTestId('iso-scene-refused').textContent).toMatch(/live\.plan must be a plan uuid/)
    rerender(<LivePlanViz data={{ live: { plan: PLAN }, title: 'x' }} fallbackText="fb" />)
    expect(screen.getByTestId('iso-scene-refused').textContent).toMatch(/unknown field « title »/)
    rerender(<LivePlanViz data={{ live: { plan: PLAN, extra: 1 } }} fallbackText="fb" />)
    expect(screen.getByTestId('iso-scene-refused').textContent).toMatch(/live: unknown field « extra »/)
    expect(api.get).not.toHaveBeenCalled()
  })

  it('beyond 12 tasks: « +N more »', async () => {
    const nodes = Array.from({ length: 15 }, (_, i) => ({ id: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`, title: `T${i}`, status: 'pending' }))
    api.getDependencyGraph.mockResolvedValue({ nodes, edges: [] })
    render(<LivePlanViz data={{ live: { plan: PLAN } }} fallbackText="" />)
    expect((await screen.findByTestId('live-plan-more')).textContent).toBe('+3 more')
    expect(screen.getByTestId('live-plan-legend').querySelectorAll('li[data-status]')).toHaveLength(12)
  })

  it('```iso-scene {"live": {"plan": …}} in the agent text opens the live view (lazy chunk)', async () => {
    const md = `Here:\n\n\`\`\`iso-scene\n${JSON.stringify({ live: { plan: PLAN } })}\n\`\`\`\n\nDone.`
    render(<MarkdownText content={md} fences={{ 'iso-scene': IsoSceneFence }} />)
    expect((await screen.findByTestId('live-plan-legend')).textContent).toContain('Build')
    expect(screen.getByText('Done.')).toBeTruthy()
  })
})

describe('parseLiveSpec', () => {
  it('accepts exactly { live: { plan: uuid } }', () => {
    expect(parseLiveSpec({ live: { plan: PLAN.toUpperCase() } })).toEqual({ ok: true, planId: PLAN })
    expect(parseLiveSpec({ live: { plan: '00000000-0000-0000-0000-000000000000' } }).ok).toBe(false)
    expect(parseLiveSpec({ live: 'x' }).ok).toBe(false)
    expect(parseLiveSpec({ live: [PLAN] }).ok).toBe(false)
    expect(parseLiveSpec({ live: {} }).ok).toBe(false)
    expect(parseLiveSpec({ live: { plan: PLAN }, stations: [] }).ok).toBe(false)
  })
  it('the text fallback names the plan', () => {
    expect(isoSceneFallback({ live: { plan: PLAN } }, 'src')).toBe(`Live plan ${PLAN}`)
    expect(isoSceneFallback({ live: { plan: 'x' } }, 'src')).toBe('src')
  })
})
