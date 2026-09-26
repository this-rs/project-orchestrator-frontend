import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Constraint, Step } from '@/types'

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

import { CompactStepList, ConstraintRow, StepRow } from './DetailRows'
import { StatusBreakdown } from './StatusBreakdown'

const now = new Date().toISOString()
const steps: Step[] = [
  { id: 's1', order: 1, description: 'Scaffold', status: 'completed', created_at: now, completed_at: now },
  { id: 's2', order: 2, description: 'Validate', status: 'pending', verification: 'tests pass', created_at: now },
]

describe('StepRow', () => {
  it('shows number / check, verification, status menu and hides actions without handlers', () => {
    const onStatusChange = vi.fn()
    render(
      <MemoryRouter>
        <ul>
          <StepRow step={steps[1]} index={1} onStatusChange={onStatusChange} onEdit={() => {}} />
          <StepRow step={steps[0]} index={0} onStatusChange={onStatusChange} />
        </ul>
      </MemoryRouter>,
    )
    const pending = screen.getByText('Validate').closest('li')!
    expect(within(pending).getByLabelText('Step 2').textContent).toBe('2')
    expect(within(pending).getByText('Verify: tests pass')).toBeTruthy()
    expect(within(pending).getByRole('button', { name: /Status: Pending/ })).toBeTruthy()
    fireEvent.click(within(pending).getByRole('button', { name: 'Actions for Step 2: Validate' }))
    expect(screen.getByRole('menuitem', { name: 'Edit step' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Delete step' })).toBeNull()
    const done = screen.getByText('Scaffold').closest('li')!
    expect(within(done).queryByRole('button', { name: /Actions for/ })).toBeNull()
    expect(within(done).getByText(/done/)).toBeTruthy()
  })
})

describe('CompactStepList', () => {
  it('renders loading, empty and list states', () => {
    const { rerender } = render(<CompactStepList steps={null} loading />)
    expect(screen.getByText('Loading steps…')).toBeTruthy()
    rerender(<CompactStepList steps={[]} />)
    expect(screen.getByText('No steps')).toBeTruthy()
    rerender(<CompactStepList steps={steps} />)
    const list = screen.getByRole('list', { name: 'Steps' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getByText('Completed')).toBeTruthy()
    expect(within(list).getByText('Pending')).toBeTruthy()
  })
})

describe('ConstraintRow', () => {
  it('shows type, severity, enforcer and a confirmed delete', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    const constraint: Constraint = { id: 'c1', constraint_type: 'performance', description: 'p95 < 200ms', severity: 'high', enforced_by: 'k6' }
    render(
      <MemoryRouter>
        <ul>
          <ConstraintRow constraint={constraint} onDelete={onDelete} />
        </ul>
      </MemoryRouter>,
    )
    expect(screen.getByText('Performance')).toBeTruthy()
    expect(screen.getByText('high severity')).toBeTruthy()
    expect(screen.getByText('by k6')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Actions for p95 < 200ms' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete constraint' }))
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)
    expect(onDelete).toHaveBeenCalled()
  })
})

describe('StatusBreakdown', () => {
  it('renders one segment + one label per non-zero status, nothing when empty', () => {
    const { container, rerender } = render(
      <StatusBreakdown kind="task" counts={[{ status: 'in_progress', count: 2 }, { status: 'blocked', count: 0 }, { status: 'completed', count: 6 }]} />,
    )
    const bar = screen.getByRole('img', { name: '2 in progress, 6 completed' })
    expect(bar.children).toHaveLength(2)
    expect((bar.children[1] as HTMLElement).style.width).toBe('75%')
    expect(screen.getByText('2 in progress')).toBeTruthy()
    expect(screen.getByText('6 completed')).toBeTruthy()
    expect(screen.queryByText(/blocked/)).toBeNull()
    rerender(<StatusBreakdown kind="task" counts={[{ status: 'pending', count: 0 }]} />)
    expect(container.textContent).toBe('')
  })
})
