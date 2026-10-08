/**
 * WaveView — the wave board reads like the rest of the app (DESIGN.md § 3–4,
 * § Mouvement): opaque cards with a tone rail, status as glyph + word, no
 * colour wash, glass buttons for the runner actions, steps expanded in place.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { WaveComputationResult } from '@/types'
import { installDomStubs, eventBusStub } from '@/pages/__tests__/testUtils'

const listSteps = vi.fn()

vi.mock('@/services', () => ({
  tasksApi: { listSteps: (...a: unknown[]) => listSteps(...a) },
  getEventBus: () => eventBusStub(),
}))
vi.mock('@/hooks', () => ({ useWorkspaceSlug: () => 'ws' }))

installDomStubs()

import { WaveView } from './WaveView'

const data: WaveComputationResult = {
  waves: [
    {
      wave_number: 1,
      task_count: 2,
      split_from_conflicts: true,
      tasks: [
        { id: 't1', title: 'Write login form', status: 'in_progress', priority: 7, affected_files: ['src/Login.tsx', 'src/api.ts'], depends_on: [] },
        { id: 't2', title: 'Design tokens', status: 'completed', affected_files: [], depends_on: [] },
      ],
    },
    {
      wave_number: 2,
      task_count: 1,
      split_from_conflicts: false,
      tasks: [{ id: 't3', title: 'Deploy', status: 'pending', affected_files: ['src/api.ts'], depends_on: ['t1'] }],
    },
  ],
  summary: { total_tasks: 3, total_waves: 2, max_parallel: 2, critical_path_length: 2, dependency_edges: 1, conflicts_detected: 1 },
  conflicts: [{ task_a: 't1', task_b: 't3', shared_files: ['src/api.ts'] }],
  edges: [['t1', 't3']],
}

function renderView(props: Partial<React.ComponentProps<typeof WaveView>> = {}) {
  return render(
    <MemoryRouter>
      <WaveView data={data} {...props} />
    </MemoryRouter>,
  )
}

describe('WaveView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listSteps.mockResolvedValue([
      { id: 's1', order: 1, description: 'Scaffold', status: 'completed', created_at: '' },
      { id: 's2', order: 2, description: 'Validate', status: 'pending', verification: 'tests pass', created_at: '' },
    ])
  })

  it('shows the summary, one column per wave, and each task as status + word, priority, files and conflicts', async () => {
    renderView()
    expect(screen.getByText('Waves:').nextElementSibling?.textContent).toBe('2')
    expect(screen.getByText('1 conflicts')).toBeTruthy()
    expect(screen.getByText('Wave 1')).toBeTruthy()
    expect(screen.getByText('Wave 2')).toBeTruthy()
    expect(screen.getByText('split')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Active wave' })).toBeTruthy()

    const card = screen.getByRole('button', { name: 'Show steps of Write login form' })
    expect(within(card).getByText('In progress')).toBeTruthy()
    expect(within(card).getByText('P7')).toBeTruthy()
    expect(within(card).getByText('Working…')).toBeTruthy()
    expect(within(card).getByText('api.ts').getAttribute('title')).toMatch(/shared with another task/)
    expect(within(card).getByLabelText('File conflict')).toBeTruthy()
    // the in-progress task was prefetched: its step progress is shown
    expect(await within(card).findByText('1/2')).toBeTruthy()
    expect(listSteps).toHaveBeenCalledWith('t1')

    // a finished card has no rail (quiet), a moving one has
    const done = screen.getByRole('button', { name: 'Show steps of Design tokens' }).parentElement!
    expect(done.querySelector('.w-\\[3px\\]')).toBeNull()
    expect(card.parentElement!.querySelector('.w-\\[3px\\]')).toBeTruthy()
  })

  it('expands a card to its steps (status as glyph + word) and a link to the task', async () => {
    renderView()
    const card = screen.getByRole('button', { name: 'Show steps of Deploy' })
    fireEvent.click(card)
    expect(await screen.findByText('Validate')).toBeTruthy()
    expect(listSteps).toHaveBeenCalledWith('t3')
    const row = screen.getByText('Validate').closest('div')!.parentElement!
    expect(within(row).getByText('Pending')).toBeTruthy()
    expect(within(row).getByText('Verify: tests pass')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open task' }).getAttribute('href')).toBe('/workspace/ws/tasks/t3')
    expect(screen.getByRole('button', { name: 'Hide steps of Deploy' })).toBeTruthy()
  })

  it('offers the runner actions as buttons: launch when approved, resume when in progress, none while running', () => {
    const onLaunch = vi.fn()
    const { rerender } = renderView({ planId: 'p1', planStatus: 'approved', onLaunch })
    fireEvent.click(screen.getByRole('button', { name: 'Launch plan' }))
    expect(onLaunch).toHaveBeenCalled()
    rerender(
      <MemoryRouter>
        <WaveView data={data} planId="p1" planStatus="in_progress" runId="r1" onLaunch={onLaunch} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Resume plan' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'View runner' })).toBeTruthy()
    rerender(
      <MemoryRouter>
        <WaveView data={data} planId="p1" planStatus="in_progress" runId="r1" onLaunch={onLaunch} isRunning />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: /plan$/ })).toBeNull()
  })

  it('says so when there is nothing to show', () => {
    render(
      <MemoryRouter>
        <WaveView data={{ ...data, waves: [] }} />
      </MemoryRouter>,
    )
    expect(screen.getByText('No waves computed')).toBeTruthy()
  })
})
