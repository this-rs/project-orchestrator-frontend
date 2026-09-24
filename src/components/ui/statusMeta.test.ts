import { describe, it, expect } from 'vitest'
import {
  STATUS_REGISTRY,
  TONE_CLASSES,
  getPriorityMeta,
  getStatusMeta,
  getStatusOptions,
  guessTone,
  humanizeStatus,
} from './statusMeta'

describe('getStatusMeta', () => {
  it('looks up known statuses per kind', () => {
    expect(getStatusMeta('task', 'in_progress')).toEqual({ label: 'In progress', tone: 'progress' })
    expect(getStatusMeta('task', 'blocked').tone).toBe('warning')
    expect(getStatusMeta('plan', 'cancelled').tone).toBe('muted')
    expect(getStatusMeta('rfc', 'under_review').label).toBe('Under review')
    expect(getStatusMeta('gate', 'Fail').tone).toBe('danger')
    expect(getStatusMeta('run', 'running').tone).toBe('progress')
  })

  it('is case-insensitive (milestones come back as `Completed`)', () => {
    expect(getStatusMeta('milestone', 'Completed')).toEqual({ label: 'Completed', tone: 'success' })
    expect(getStatusMeta('gate', 'pass').label).toBe('Pass')
  })

  it('falls back to a humanized label + guessed tone', () => {
    expect(getStatusMeta('task', 'waiting_for_review')).toEqual({ label: 'Waiting for review', tone: 'warning' })
    expect(getStatusMeta(undefined, 'running')).toEqual({ label: 'Running', tone: 'progress' })
    expect(getStatusMeta(undefined, null)).toEqual({ label: 'Unknown', tone: 'muted' })
  })

  it('every registry entry uses a defined tone', () => {
    for (const reg of Object.values(STATUS_REGISTRY)) {
      for (const meta of Object.values(reg as Record<string, { tone: keyof typeof TONE_CLASSES }>)) {
        expect(TONE_CLASSES[meta.tone]).toBeDefined()
      }
    }
  })
})

describe('guessTone / humanizeStatus', () => {
  it('guesses sensible tones', () => {
    expect(guessTone('FAILED')).toBe('danger')
    expect(guessTone('inactive')).toBe('muted')
    expect(guessTone('disconnected')).toBe('muted')
    expect(guessTone('connected')).toBe('success')
    expect(guessTone('queued')).toBe('info')
    expect(guessTone('whatever')).toBe('neutral')
  })

  it('humanizes snake / kebab / camel case', () => {
    expect(humanizeStatus('needs_review')).toBe('Needs review')
    expect(humanizeStatus('in-progress')).toBe('In progress')
    expect(humanizeStatus('needsReview')).toBe('Needs review')
  })
})

describe('getStatusOptions', () => {
  it('returns every status of a kind in registry order', () => {
    expect(getStatusOptions('decision')).toEqual([
      { value: 'proposed', label: 'Proposed' },
      { value: 'accepted', label: 'Accepted' },
      { value: 'deprecated', label: 'Deprecated' },
      { value: 'superseded', label: 'Superseded' },
    ])
  })
})

describe('getPriorityMeta', () => {
  it('maps numeric priorities to tones and hides empty ones', () => {
    expect(getPriorityMeta(undefined)).toBeNull()
    expect(getPriorityMeta(0)).toBeNull()
    expect(getPriorityMeta(10)?.tone).toBe('danger')
    expect(getPriorityMeta(8)).toMatchObject({ short: 'P8', tone: 'warning' })
    expect(getPriorityMeta(5)?.tone).toBe('neutral')
    expect(getPriorityMeta(2)?.tone).toBe('muted')
  })
})
