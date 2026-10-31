/**
 * The chat's first screen adapts its quick actions to the project profile: a `work`
 * project (no source tree) gets everyday-life actions, not the code-oriented ones
 * (impact / architecture / code search would be noise there). Without a project — or
 * on a payload older than the `profile` field — it stays the software set.
 *
 * Run with: npx vitest run src/components/chat/ChatWelcome.profile.test.tsx
 */
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Project } from '@/types'

// The welcome screen aggregates APIs; here we only care about which actions it renders.
vi.mock('@/hooks', () => ({
  useWelcomeData: () => ({
    data: { activePlans: [], notesNeedingReview: [], recentSessions: [], projects: [], totalActiveNotes: 0 },
    isLoading: false,
    refetch: () => {},
  }),
}))

import { ChatWelcome } from './ChatWelcome'

const project = (profile?: 'software' | 'work'): Project => ({
  id: 'p1',
  name: 'P',
  slug: 'p',
  created_at: '2026-01-01T00:00:00Z',
  profile,
})

function mount(selectedProject: Project | null) {
  return render(
    <ChatWelcome onQuickAction={() => {}} onSelectSession={() => {}} selectedProject={selectedProject} />,
  )
}

describe('ChatWelcome — quick actions follow the project profile', () => {
  it('a software project shows the code-oriented actions', () => {
    mount(project('software'))
    expect(screen.getByText('Impact analysis')).toBeInTheDocument()
    expect(screen.getByText('Architecture')).toBeInTheDocument()
    expect(screen.getByText('Code search')).toBeInTheDocument()
    expect(screen.queryByText('Prepare something')).toBeNull()
  })

  it('a work project shows the everyday-life actions, not the code ones', () => {
    mount(project('work'))
    expect(screen.getByText('Prepare something')).toBeInTheDocument()
    expect(screen.getByText('Keep track of something')).toBeInTheDocument()
    expect(screen.getByText('Resume what stopped')).toBeInTheDocument()
    expect(screen.getByText('What did we decide?')).toBeInTheDocument()
    expect(screen.getByText('Where do we stand?')).toBeInTheDocument()
    expect(screen.queryByText('Impact analysis')).toBeNull()
    expect(screen.queryByText('Code search')).toBeNull()
  })

  it('no project, or a payload without profile, keeps the software actions', () => {
    const first = mount(null)
    expect(screen.getByText('Impact analysis')).toBeInTheDocument()
    expect(screen.queryByText('Prepare something')).toBeNull()
    first.unmount()

    mount(project(undefined))
    expect(screen.getByText('Architecture')).toBeInTheDocument()
  })

  it('a work action inserts its prompt at the caret', () => {
    const onQuickAction = vi.fn()
    render(<ChatWelcome onQuickAction={onQuickAction} onSelectSession={() => {}} selectedProject={project('work')} />)
    fireEvent.click(screen.getByText('Prepare something'))
    expect(onQuickAction).toHaveBeenCalledWith(
      'Help me prepare the following, as a plan of tasks with what depends on what: ',
      0,
    )
  })
})
