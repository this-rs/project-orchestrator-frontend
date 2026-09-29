import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { StatusDot, StatusText, StatusMenu, PriorityText } from './Status'

describe('StatusDot', () => {
  it('is decorative without a label, an img with one', () => {
    const { container, rerender } = render(<StatusDot tone="success" />)
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
    rerender(<StatusDot kind="task" status="failed" label="Failed" />)
    const img = screen.getByRole('img', { name: 'Failed' })
    expect(img.innerHTML).toContain('bg-red-400')
  })
})

describe('StatusText', () => {
  it('renders dot + label in the tone colour', () => {
    render(<StatusText kind="plan" status="in_progress" />)
    const el = screen.getByText('In progress')
    expect(el.className).toContain('text-indigo-300')
  })

  it('falls back for unknown statuses', () => {
    render(<StatusText status="waiting_for_ci" />)
    expect(screen.getByText('Waiting for ci')).toBeTruthy()
  })
})

describe('PriorityText', () => {
  it('renders nothing for missing priority, P-value otherwise', () => {
    const { container, rerender } = render(<PriorityText priority={0} />)
    expect(container.innerHTML).toBe('')
    rerender(<PriorityText priority={9} />)
    expect(screen.getByText('P9').getAttribute('aria-label')).toContain('critical')
  })
})

describe('StatusMenu', () => {
  it('lists statuses of the kind and calls onChange with the new value', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined)
    render(<StatusMenu kind="decision" status="proposed" onChange={onChange} />)
    const trigger = screen.getByRole('button', { name: 'Status: Proposed. Change status' })
    fireEvent.click(trigger)
    const items = screen.getAllByRole('menuitemradio')
    expect(items.map((i) => i.textContent)).toEqual(['Proposed', 'Accepted', 'Deprecated', 'Superseded'])
    expect(screen.getByRole('menuitemradio', { name: 'Proposed' }).getAttribute('aria-checked')).toBe('true')
    // focus lands on the current status
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'Proposed' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Accepted' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('accepted'))
  })

  it('does not call onChange when re-selecting the current status', () => {
    const onChange = vi.fn()
    render(<StatusMenu kind="task" status="pending" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Change status/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Pending' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('restricts choices with `options` and does not bubble to parents', () => {
    const parent = vi.fn()
    render(
      <div onClick={parent} onKeyDown={parent}>
        <StatusMenu kind="task" status="pending" onChange={() => {}} options={['pending', 'completed']} />
      </div>,
    )
    const trigger = screen.getByRole('button', { name: /Change status/ })
    fireEvent.keyDown(trigger, { key: 'Enter' })
    fireEvent.click(trigger)
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(2)
    expect(parent).not.toHaveBeenCalled()
  })
})
