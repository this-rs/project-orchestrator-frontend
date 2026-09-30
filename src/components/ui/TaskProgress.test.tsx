import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TaskProgress } from './TaskProgress'

const base = { total: 8, completed: 3, in_progress: 2, blocked: 1, pending: 2, failed: 0, percentage: 37.5 }

describe('TaskProgress', () => {
  it('renders nothing without tasks or counters', () => {
    const { container, rerender } = render(<TaskProgress />)
    expect(container.innerHTML).toBe('')
    rerender(<TaskProgress counts={{ ...base, total: 0, completed: 0, percentage: 0 }} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows done/total, then only the non-zero states', () => {
    render(<TaskProgress counts={base} />)
    expect(screen.getByText('3/8')).toBeTruthy()
    expect(screen.getByText(/38%/)).toBeTruthy()
    expect(screen.getByText(/2 active/)).toBeTruthy()
    expect(screen.getByText(/1 blocked/)).toBeTruthy()
    expect(screen.queryByText(/failed/)).toBeNull()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('38')
  })
})
