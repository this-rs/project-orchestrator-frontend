import { describe, it, expect } from 'vitest'
import {
  countActiveFilters,
  formatCost,
  formatDuration,
  formatMessageCount,
  formatRelativeShort,
  getDateGroup,
  groupSessionsByDate,
  permissionModeMeta,
  pluralize,
  sessionDisplayTitle,
  sessionPreview,
  sessionScope,
  shortModelName,
  shortenPath,
  spawnLabel,
} from './sessionListUtils'

// Local-time "now": Wed 24 Sep 2026, 15:00
const NOW = new Date(2026, 8, 24, 15, 0, 0)
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m, d, h, min).toISOString()

describe('getDateGroup', () => {
  it('buckets by calendar day, not by 24h windows', () => {
    expect(getDateGroup(at(2026, 8, 24, 0, 1), NOW)).toBe('Today')
    expect(getDateGroup(at(2026, 8, 23, 23, 59), NOW)).toBe('Yesterday')
    expect(getDateGroup(at(2026, 8, 23, 0, 0), NOW)).toBe('Yesterday')
    expect(getDateGroup(at(2026, 8, 22), NOW)).toBe('Previous 7 days')
    expect(getDateGroup(at(2026, 8, 17), NOW)).toBe('Previous 7 days')
    expect(getDateGroup(at(2026, 8, 16), NOW)).toBe('Previous 30 days')
    expect(getDateGroup(at(2026, 7, 25), NOW)).toBe('Previous 30 days')
    expect(getDateGroup(at(2026, 7, 24), NOW)).toBe('Older')
  })

  it('treats future timestamps (clock skew) as Today', () => {
    expect(getDateGroup(at(2026, 8, 25), NOW)).toBe('Today')
  })
})

describe('groupSessionsByDate', () => {
  it('returns non-empty groups in canonical order and keeps input order inside groups', () => {
    const sessions = [
      { id: 'a', updated_at: at(2026, 0, 1) },
      { id: 'b', updated_at: at(2026, 8, 24, 14) },
      { id: 'c', updated_at: at(2026, 8, 23) },
      { id: 'd', updated_at: at(2026, 8, 24, 9) },
    ]
    const groups = groupSessionsByDate(sessions, NOW)
    expect(groups.map((g) => g.group)).toEqual(['Today', 'Yesterday', 'Older'])
    expect(groups[0].sessions.map((s) => s.id)).toEqual(['b', 'd'])
  })

  it('returns an empty array for no sessions', () => {
    expect(groupSessionsByDate([], NOW)).toEqual([])
  })
})

describe('formatRelativeShort', () => {
  it('uses compact units under a week', () => {
    expect(formatRelativeShort(new Date(NOW.getTime() - 20_000), NOW)).toBe('now')
    expect(formatRelativeShort(new Date(NOW.getTime() - 5 * 60_000), NOW)).toBe('5m')
    expect(formatRelativeShort(new Date(NOW.getTime() - 3 * 3_600_000), NOW)).toBe('3h')
    expect(formatRelativeShort(new Date(NOW.getTime() - 2 * 86_400_000), NOW)).toBe('2d')
  })

  it('switches to an absolute date after a week (year only when different)', () => {
    expect(formatRelativeShort(new Date(2026, 8, 12, 10), NOW)).toBe('12 Sep')
    expect(formatRelativeShort(new Date(2025, 2, 3, 10), NOW)).toBe('3 Mar 2025')
  })

  it('accepts ISO strings and epoch milliseconds', () => {
    expect(formatRelativeShort(new Date(NOW.getTime() - 60 * 60_000).toISOString(), NOW)).toBe('1h')
    expect(formatRelativeShort(NOW.getTime() - 120_000, NOW)).toBe('2m')
  })
})

describe('formatDuration', () => {
  it('formats elapsed time', () => {
    expect(formatDuration(new Date(NOW.getTime() - 10_000).toISOString(), NOW)).toBe('<1m')
    expect(formatDuration(new Date(NOW.getTime() - 42 * 60_000).toISOString(), NOW)).toBe('42m')
    expect(formatDuration(new Date(NOW.getTime() - 65 * 60_000).toISOString(), NOW)).toBe('1h 5m')
  })
})

describe('metadata formatting', () => {
  it('formatCost hides zero/undefined', () => {
    expect(formatCost(undefined)).toBeNull()
    expect(formatCost(0)).toBeNull()
    expect(formatCost(1.234)).toBe('$1.23')
  })

  it('formatMessageCount pluralizes', () => {
    expect(formatMessageCount(1)).toBe('1 msg')
    expect(formatMessageCount(0)).toBe('0 msgs')
    expect(formatMessageCount(12)).toBe('12 msgs')
  })

  it('pluralize supports irregular plurals', () => {
    expect(pluralize(1, 'match', 'matches')).toBe('1 match')
    expect(pluralize(3, 'match', 'matches')).toBe('3 matches')
    expect(pluralize(2, 'run')).toBe('2 runs')
  })

  it('shortenPath replaces the home directory', () => {
    expect(shortenPath('/Users/alice/projects/x')).toBe('~/projects/x')
    expect(shortenPath('/home/bob/x')).toBe('~/x')
    expect(shortenPath('~/already')).toBe('~/already')
    expect(shortenPath('/opt/app')).toBe('/opt/app')
  })

  it('shortModelName drops vendor prefix and date suffix', () => {
    expect(shortModelName('claude-opus-4-5-20251101')).toBe('opus-4-5')
    expect(shortModelName('claude-sonnet-4-6')).toBe('sonnet-4-6')
    expect(shortModelName('gpt-x')).toBe('gpt-x')
  })

  it('sessionDisplayTitle falls back to a short id', () => {
    expect(sessionDisplayTitle({ id: 'abcdef1234567', title: 'Hello' })).toBe('Hello')
    expect(sessionDisplayTitle({ id: 'abcdef1234567', title: '' })).toBe('Session abcdef12')
    expect(sessionDisplayTitle({ id: 'abcdef1234567' })).toBe('Session abcdef12')
  })

  it('sessionPreview hides previews identical to the title or blank', () => {
    expect(sessionPreview({ title: 'Same', preview: 'Same' })).toBeNull()
    expect(sessionPreview({ title: 'T', preview: '   ' })).toBeNull()
    expect(sessionPreview({ title: 'T' })).toBeNull()
    expect(sessionPreview({ title: 'T', preview: 'Other' })).toBe('Other')
  })

  it('sessionScope prefers the workspace over the project', () => {
    expect(sessionScope({ workspace_slug: 'ws', project_slug: 'p' })).toEqual({ kind: 'workspace', slug: 'ws' })
    expect(sessionScope({ project_slug: 'p' })).toEqual({ kind: 'project', slug: 'p' })
    expect(sessionScope({})).toBeNull()
  })

  it('permissionModeMeta exposes a readable label', () => {
    expect(permissionModeMeta(undefined)).toBeNull()
    expect(permissionModeMeta('bypassPermissions')?.label).toBe('Bypass permissions')
    expect(permissionModeMeta('plan')?.dot).toBe('bg-gray-400')
  })

  it('spawnLabel covers every origin and falls back to "spawned"', () => {
    expect(spawnLabel({ type: 'runner', run_id: 'r', plan_id: 'p' }).label).toBe('runner')
    expect(spawnLabel({ type: 'conversation', parent_session_id: 's' }).label).toBe('spawned')
    expect(spawnLabel({ type: 'trigger', trigger_id: 't', event_type: 'e' }).label).toBe('trigger')
    expect(spawnLabel({ type: 'unknown' }).label).toBe('spawned')
  })

  it('countActiveFilters counts non-default filters', () => {
    expect(countActiveFilters({ project: '', planOrRfc: '', showSpawned: true })).toBe(0)
    expect(countActiveFilters({ project: 'p', planOrRfc: 'plan:1', showSpawned: false })).toBe(3)
  })
})
