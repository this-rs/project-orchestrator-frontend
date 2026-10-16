import { describe, expect, it } from 'vitest'
import { hoverInfo } from './hoverInfo'
import type { TimelineItem } from './model'
import { DEFAULT_TIMELINE_LABELS } from './status'

const T0 = 1_700_000_000_000
const item = (over: Partial<TimelineItem> = {}): TimelineItem => ({
  id: 'grep', kind: 'tool', status: 'done', label: 'Grep · x', startedAt: T0, endedAt: T0 + 1000, durationMs: 1000,
  laneId: 'l', provider: 'claude-code', model: 'claude-sonnet-4-5-20250929', ...over,
})

const valueOf = (over: Partial<TimelineItem>, label: string) =>
  hoverInfo(item(over), DEFAULT_TIMELINE_LABELS).lines.find((l) => l.label === label)?.value

describe('hoverInfo', () => {
  it('says what the timeline knows of an item: status, kind, where it ran, how long, its bounds', () => {
    const info = hoverInfo(item(), DEFAULT_TIMELINE_LABELS)
    expect(info.title).toBe('Grep · x')
    expect(valueOf({}, 'Status')).toBe('Done')
    expect(valueOf({}, 'Kind')).toBe('Tool call')
    expect(valueOf({}, 'Provider')).toBe('claude-code')
    expect(valueOf({}, 'Model')).toBe('sonnet-4-5')
    expect(valueOf({}, 'Total time')).toBe('1.0 s')
    expect(valueOf({}, 'Start')).toMatch(/\d{2}:\d{2}:\d{2}/)
    expect(valueOf({}, 'End')).toMatch(/\d{2}:\d{2}:\d{2}/)
  })

  it('shows only what is known: no provider, no model, no end while it runs', () => {
    const info = hoverInfo(item({ provider: undefined, model: undefined, endedAt: undefined, durationMs: undefined, status: 'running' }), DEFAULT_TIMELINE_LABELS)
    const labels = info.lines.map((l) => l.label)
    expect(labels).not.toContain('Provider')
    expect(labels).not.toContain('Model')
    expect(labels).not.toContain('End')
    expect(labels).toContain('Start')
    expect(info.lines.find((l) => l.label === 'Status')?.value).toBe('Running')
  })

  it('falls back to the kind for a title, and says when a call never ran', () => {
    const info = hoverInfo(item({ label: '', kind: 'agent', run: 'denied' }), DEFAULT_TIMELINE_LABELS)
    expect(info.title).toBe('Sub-agent')
    expect(info.lines.some((l) => l.label === undefined && l.value === 'Did not run: the permission was denied')).toBe(true)
  })
})
