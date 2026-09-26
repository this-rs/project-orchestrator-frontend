import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MiniProgress, RowSelect, ViewModeToggle } from './ListControls'

describe('ViewModeToggle', () => {
  it('is a labelled group of two pressed/unpressed buttons', () => {
    const onChange = vi.fn()
    render(<ViewModeToggle value="list" onChange={onChange} />)
    expect(screen.getByRole('group', { name: 'View mode' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'List view' }).getAttribute('aria-pressed')).toBe('true')
    const board = screen.getByRole('button', { name: 'Board view' })
    expect(board.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(board)
    expect(onChange).toHaveBeenCalledWith('kanban')
  })
})

describe('RowSelect', () => {
  it('is a checkbox that reports shift-clicks and never bubbles to the row', () => {
    const onToggle = vi.fn()
    const rowClick = vi.fn()
    render(
      <div onClick={rowClick}>
        <RowSelect selected={false} onToggle={onToggle} label="Select Auth flow" />
      </div>,
    )
    const box = screen.getByRole('checkbox', { name: 'Select Auth flow' })
    expect(box.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(box, { shiftKey: true })
    expect(onToggle).toHaveBeenCalledWith(true)
    expect(rowClick).not.toHaveBeenCalled()
  })
})

describe('MiniProgress', () => {
  it('clamps the value and exposes a progressbar', () => {
    render(<MiniProgress value={140} label="Step progress" />)
    const bar = screen.getByRole('progressbar', { name: 'Step progress' })
    expect(bar.getAttribute('aria-valuenow')).toBe('100')
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('100%')
  })
})
