import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WindowedList, type WindowedItem } from './WindowedList'

const items: WindowedItem[] = []
for (let g = 0; g < 10; g++) {
  items.push({ key: `h${g}`, height: 30, header: true })
  for (let r = 0; r < 100; r++) items.push({ key: `r${g}-${r}`, height: 50 })
}
const label = (i: number) => (items[i].header ? `Header ${items[i].key}` : `Row ${items[i].key}`)

const setup = (list = items) =>
  render(<WindowedList items={list} renderItem={(i) => <span>{label(i)}</span>} label="Things" resetKey="a" />)

describe('WindowedList', () => {
  it('mounts only the window, in an accessible focusable region', () => {
    setup()
    const region = screen.getByRole('region', { name: 'Things' })
    expect(region.getAttribute('tabindex')).toBe('0')
    expect(screen.getByText('Header h0')).toBeTruthy()
    expect(document.querySelectorAll('span').length).toBeLessThan(40)
    expect(screen.queryByText('Row r9-99')).toBeNull()
  })

  it('reaches the last item by scrolling and pins the current group header', () => {
    setup()
    const region = screen.getByRole('region', { name: 'Things' })
    region.scrollTop = 1e7
    fireEvent.scroll(region)
    expect(screen.getByText('Row r9-99')).toBeTruthy()
    const pinned = screen.getByTestId('windowed-pinned-header')
    expect(pinned.textContent).toBe('Header h9')
    // drawn once
    expect(screen.getAllByText('Header h9')).toHaveLength(1)
  })

  it('goes back to the top when the reset key changes', () => {
    const { rerender } = setup()
    const region = screen.getByRole('region', { name: 'Things' })
    region.scrollTop = 5000
    fireEvent.scroll(region)
    expect(screen.queryByText('Row r0-0')).toBeNull()
    rerender(<WindowedList items={items} renderItem={(i) => <span>{label(i)}</span>} label="Things" resetKey="b" />)
    expect(screen.getByText('Row r0-0')).toBeTruthy()
    expect(screen.queryByTestId('windowed-pinned-header')).toBeNull()
  })

  it('renders nothing but the scroller for an empty list', () => {
    setup([])
    expect(screen.getByRole('region', { name: 'Things' })).toBeTruthy()
    expect(screen.queryByTestId('windowed-pinned-header')).toBeNull()
  })
})
