/**
 * ChatWelcome — the suggestions follow the profile of the current project
 * (website/AUDIENCE.md § 6: the chat's first screen must not be developer-only),
 * statuses read the registry, and no material is typed by hand.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { Project } from '@/types'

const welcome = vi.hoisted(() => ({
  data: {
    activePlans: [] as unknown[],
    notesNeedingReview: [] as unknown[],
    totalActiveNotes: 0,
    recentSessions: [] as unknown[],
    projects: [] as unknown[],
  },
  isLoading: false,
  refetch: vi.fn(),
}))

vi.mock('@/hooks', () => ({ useWelcomeData: () => welcome }))

import { ChatWelcome } from './ChatWelcome'
import { suggestionsFor, WELCOME_TEXT } from './welcomeSuggestions'

const work: Project = { id: 'p1', name: 'Autumn offsite', slug: 'offsite', profile: 'work', created_at: '2026-01-01' }
const software: Project = { id: 'p2', name: 'Backend', slug: 'backend', profile: 'software', root_path: '/src', created_at: '2026-01-01' }
/** A payload older than the `profile` field: a codebase. */
const legacy: Project = { id: 'p3', name: 'Old', slug: 'old', root_path: '/src/old', created_at: '2026-01-01' }

const CODE_LABELS = ['What breaks if I change…', 'Where is … handled?', 'Draw the architecture']
const WORK_LABELS = ['Prepare something', 'Keep track of something', 'Resume what stopped', 'What did we decide?']

function mount(project: Project | null, onQuickAction = vi.fn(), onSelectSession = vi.fn()) {
  render(<ChatWelcome selectedProject={project} onQuickAction={onQuickAction} onSelectSession={onSelectSession} />)
  const list = screen.getByRole('region', { name: WELCOME_TEXT.suggestions })
  return { list, onQuickAction, onSelectSession, labels: within(list).getAllByRole('button').map((b) => b.textContent ?? '') }
}

describe('ChatWelcome — suggestions by profile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    welcome.isLoading = false
    welcome.data = { activePlans: [], notesNeedingReview: [], totalActiveNotes: 0, recentSessions: [], projects: [] }
  })

  it('a project without code gets the work of everyday life and no code question', () => {
    const { labels } = mount(work)
    for (const l of WORK_LABELS) expect(labels.some((t) => t.startsWith(l))).toBe(true)
    for (const l of CODE_LABELS) expect(labels.some((t) => t.startsWith(l))).toBe(false)
    expect(document.body.textContent).not.toMatch(/Impact analysis|Code search|Architecture\b/)
    // a project is selected: no hint to choose one
    expect(screen.queryByText(WELCOME_TEXT.noProject)).toBeNull()
  })

  it('a codebase gets the three code questions, said without jargon, and the common ones', () => {
    const { labels } = mount(software)
    for (const l of CODE_LABELS) expect(labels.some((t) => t.startsWith(l))).toBe(true)
    expect(labels.some((t) => t.startsWith("What's next?"))).toBe(true)
    expect(labels.some((t) => t.startsWith('What did we decide?'))).toBe(true)
    expect(labels.some((t) => t.startsWith('Prepare something'))).toBe(false)
  })

  it('a project older than the profile field is a codebase', () => {
    const { labels } = mount(legacy)
    expect(labels.some((t) => t.startsWith('Draw the architecture'))).toBe(true)
  })

  it('without a project, the screen reads like a project without code and says how to scope it', () => {
    const { labels } = mount(null)
    for (const l of CODE_LABELS) expect(labels.some((t) => t.startsWith(l))).toBe(false)
    expect(labels.some((t) => t.startsWith('Prepare something'))).toBe(true)
    expect(screen.getByText(WELCOME_TEXT.noProject)).toBeTruthy()
  })

  it('the prompt sent is more precise than the label, with the cursor where the person completes it', () => {
    const { list, onQuickAction } = mount(work)
    fireEvent.click(within(list).getByRole('button', { name: /^Prepare something/ }))
    expect(onQuickAction).toHaveBeenCalledWith(expect.stringMatching(/^Help me prepare .*: $/), 0)
    expect(onQuickAction.mock.calls[0][0]).not.toBe('Prepare something')
  })

  it('every suggestion has a label, a hint and a prompt; the sets differ only by what needs code', () => {
    const workSet = suggestionsFor('work')
    const codeSet = suggestionsFor('software')
    for (const s of [...workSet, ...codeSet]) {
      expect(s.label.length).toBeGreaterThan(0)
      expect(s.hint.length).toBeGreaterThan(0)
      expect(s.prompt.length).toBeGreaterThan(s.label.length / 2)
    }
    expect(suggestionsFor(null)).toBe(workSet)
    const shared = workSet.filter((s) => codeSet.includes(s)).map((s) => s.id)
    expect(shared).toEqual(expect.arrayContaining(['next', 'decided']))
  })

  it('suggestion buttons are the product button, flat, with no glow and no filled pill', () => {
    const { list } = mount(software)
    for (const b of within(list).getAllByRole('button')) {
      expect(b.className).toContain('btn-secondary')
      expect(b.className).toContain('btn-flat')
      expect(b.className).not.toMatch(/glow|rounded-full/)
    }
    // the block header is the list-group register, never uppercase
    expect(document.querySelector('[class*="uppercase"]')).toBeNull()
  })
})

describe('ChatWelcome — where things stand', () => {
  beforeEach(() => {
    welcome.isLoading = false
    welcome.data = {
      activePlans: [{ id: 'pl1', title: 'Offsite plan', status: 'in_progress', priority: 8, created_at: '2026-01-01', created_by: 'me', description: '' }],
      notesNeedingReview: [{ id: 'n1' }],
      totalActiveNotes: 12,
      recentSessions: [{ id: 's1', title: 'Venue shortlist', created_at: new Date(Date.now() - 3600_000).toISOString() }],
      projects: [],
    }
  })

  it('the plan status reads the registry (StatusText), not a local colour', () => {
    mount(work)
    expect(screen.getByText('Offsite plan')).toBeTruthy()
    const status = screen.getByText('In progress')
    expect(status.closest('[class*="text-amber"]')).toBeNull()
    expect(status.className).toContain('text-indigo-300')
    expect(screen.getByText('P8')).toBeTruthy()
    expect(screen.getByText('active plan', { exact: false })).toBeTruthy()
    expect(screen.getByText(WELCOME_TEXT.toReview, { exact: false })).toBeTruthy()
    expect(screen.getByText('notes', { exact: false })).toBeTruthy()
  })

  it('a recent conversation reopens on click, with its time from the shared formatter', () => {
    const { onSelectSession } = mount(work)
    const row = screen.getByRole('button', { name: /Venue shortlist/ })
    expect(within(row).getByText('1h')).toBeTruthy()
    fireEvent.click(row)
    expect(onSelectSession).toHaveBeenCalledWith('s1', undefined, 'Venue shortlist')
  })
})
