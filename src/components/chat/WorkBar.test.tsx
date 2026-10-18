/**
 * The work bar of the composer tray: what it shows collapsed, its rows, and
 * where a row leads. Which plans and tasks are listed is tested without a DOM
 * in `workInProgress.test.ts`.
 *
 * Run with: npx vitest run src/components/chat/WorkBar.test.tsx
 */
import '@testing-library/jest-dom/vitest'
import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { TimelineWork } from '@/components/timeline'
import { WorkBar } from './WorkBar'

const work: TimelineWork = {
  plans: [{ id: 'p1', title: 'Ship the work bar', status: 'in_progress' }],
  tasks: [
    {
      id: 't1',
      title: 'Write the component',
      status: 'in_progress',
      planId: 'p1',
      steps: [
        { id: 's1', description: 'Derive', status: 'completed', order: 0 },
        { id: 's2', description: 'Render the rows', status: 'in_progress', order: 1 },
        { id: 's3', description: 'Test', status: 'pending', order: 2 },
      ],
    },
    { id: 't2', title: 'Wait for review', status: 'blocked', steps: [] },
    { id: 't3', title: 'Old task', status: 'completed', steps: [] },
  ],
}

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>
}

function mount(w: TimelineWork | undefined, workspaceSlug: string | null = 'ws') {
  return render(
    <MemoryRouter initialEntries={['/chat']}>
      <Routes>
        <Route path="*" element={<><WorkBar work={w} workspaceSlug={workspaceSlug} /><Where /></>} />
      </Routes>
    </MemoryRouter>,
  )
}

const summary = () => screen.getByRole('button', { name: /^In progress:/ })

describe('<WorkBar />', () => {
  it('renders nothing when no plan or task is open', () => {
    mount(undefined)
    expect(screen.queryByTestId('work-bar')).toBeNull()
    mount({ plans: [{ id: 'p', title: 'Done', status: 'completed' }], tasks: [{ id: 't', title: 'Done', status: 'completed', steps: [] }] })
    expect(screen.queryByTestId('work-bar')).toBeNull()
  })

  it('collapsed: counts the plans and tasks and names the current task with its step', () => {
    mount(work)
    const button = summary()
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveAccessibleName('In progress: 1 plan, 2 tasks — current task: Write the component')
    expect(button).toHaveTextContent('1 plan, 2 tasks')
    expect(button).toHaveTextContent('Write the component')
    expect(button).toHaveTextContent('step 1/3')
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('expanded: one row per plan and task, the status said in words next to its glyph', () => {
    mount(work)
    fireEvent.click(summary())
    expect(summary()).toHaveAttribute('aria-expanded', 'true')
    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(rows.map((r) => r.dataset.kind)).toEqual(['plan', 'task', 'task'])
    expect(rows[0]).toHaveTextContent('Ship the work bar')
    expect(rows[0]).toHaveTextContent('In progress')
    expect(rows[1]).toHaveTextContent('Write the component')
    expect(rows[1]).toHaveTextContent('Render the rows')
    expect(rows[1]).toHaveTextContent('step 1/3')
    expect(rows[2]).toHaveTextContent('Blocked')
    // Never the colour alone: each status carries a glyph and a word.
    for (const row of rows) expect(row.querySelector('svg[aria-hidden="true"].w-3\\.5')).not.toBeNull()
    expect(screen.queryByText('Old task')).toBeNull()
  })

  it('a row opens the plan or the task page', () => {
    mount(work)
    fireEvent.click(summary())
    expect(screen.getByRole('link', { name: 'Open the plan Ship the work bar' })).toHaveAttribute('href', '/workspace/ws/plans/p1')
    fireEvent.click(screen.getByRole('link', { name: 'Open the task Wait for review' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/workspace/ws/tasks/t2')
  })

  it('without a workspace the rows are not links', () => {
    mount(work, null)
    fireEvent.click(summary())
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.getByText('Wait for review')).toBeInTheDocument()
  })
})
