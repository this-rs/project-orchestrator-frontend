/**
 * Searchable select (WAI-ARIA 1.2 combobox with a list popup).
 *
 * Run with: npx vitest run src/components/ui/SearchableSelect.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { SearchableSelect, type SearchableOption } from './SearchableSelect'

const OPTIONS: SearchableOption[] = [
  { value: 'deepseek-flash', label: 'deepseek-flash', description: 'outils : oui · 1 048 576 tokens' },
  { value: 'qwen-coder', label: 'Qwen Édition Coder', description: 'outils : non' },
  { value: 'llama-3', label: 'Llama 3' },
]
const NOUN = { one: 'modèle', other: 'modèles' }

function Harness(props: Partial<React.ComponentProps<typeof SearchableSelect>> & { initial?: string }) {
  const [value, setValue] = useState(props.initial ?? '')
  return (
    <>
      <label htmlFor="m">Modèle</label>
      <SearchableSelect id="m" options={OPTIONS} noun={NOUN} {...props} value={value} onChange={(v) => { setValue(v); props.onChange?.(v) }} />
    </>
  )
}

const box = () => screen.getByRole('combobox', { name: 'Modèle' }) as HTMLInputElement
const open = () => fireEvent.click(box())
const type = (text: string) => fireEvent.change(box(), { target: { value: text } })
const names = () => screen.queryAllByRole('option').map((o) => o.textContent)

describe('SearchableSelect', () => {
  it('is a combobox wired to a listbox, closed until used', () => {
    render(<Harness />)
    expect(box().getAttribute('aria-expanded')).toBe('false')
    expect(box().getAttribute('aria-autocomplete')).toBe('list')
    expect(screen.queryByRole('listbox')).toBeNull()
    open()
    expect(box().getAttribute('aria-expanded')).toBe('true')
    const list = screen.getByRole('listbox')
    expect(box().getAttribute('aria-controls')).toBe(list.id)
    expect(screen.getAllByRole('option').length).toBe(3)
  })

  it('shows the count and the secondary line of each option', () => {
    render(<Harness />)
    open()
    expect(screen.getByText('3 modèles')).toBeTruthy()
    expect(screen.getByText('outils : oui · 1 048 576 tokens')).toBeTruthy()
  })

  it('filters by id and by label, ignoring case and accents, and counts "n sur total"', () => {
    render(<Harness />)
    open()
    type('FLASH')
    expect(names()).toEqual(['deepseek-flashoutils : oui · 1 048 576 tokens'])
    expect(screen.getByText('1 sur 3')).toBeTruthy()
    type('edition')
    expect(names().length).toBe(1)
    expect(names()[0]).toContain('Qwen Édition Coder')
    type('ÉDITION')
    expect(names().length).toBe(1)
    type('qwen-coder')
    expect(names().length).toBe(1)
  })

  it('highlights the matched text', () => {
    render(<Harness />)
    open()
    type('flas')
    const mark = screen.getByRole('option').querySelector('mark')
    expect(mark?.textContent).toBe('flas')
  })

  it('says so when nothing matches', () => {
    render(<Harness />)
    open()
    type('xyz')
    expect(screen.getByText('Aucun modèle ne correspond à « xyz »')).toBeTruthy()
    expect(screen.queryAllByRole('option').length).toBe(0)
  })

  it('moves with the arrows, Home and End, and selects with Enter', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    open()
    const active = () => document.getElementById(box().getAttribute('aria-activedescendant') ?? '')?.textContent
    expect(active()).toContain('deepseek-flash')
    fireEvent.keyDown(box(), { key: 'ArrowDown' })
    expect(active()).toContain('Qwen')
    fireEvent.keyDown(box(), { key: 'End' })
    expect(active()).toContain('Llama 3')
    fireEvent.keyDown(box(), { key: 'ArrowDown' })
    expect(active()).toContain('deepseek-flash')
    fireEvent.keyDown(box(), { key: 'ArrowUp' })
    expect(active()).toContain('Llama 3')
    fireEvent.keyDown(box(), { key: 'Home' })
    fireEvent.keyDown(box(), { key: 'ArrowDown' })
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('qwen-coder')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(box().value).toBe('Qwen Édition Coder')
  })

  it('opens with ArrowDown from the closed field', () => {
    render(<Harness />)
    box().focus()
    fireEvent.keyDown(box(), { key: 'ArrowDown' })
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it('selects with a click, and marks the current value', () => {
    render(<Harness initial="llama-3" />)
    expect(box().value).toBe('Llama 3')
    open()
    const current = screen.getAllByRole('option').find((o) => o.getAttribute('aria-selected') === 'true')
    expect(current?.textContent).toContain('Llama 3')
    fireEvent.click(screen.getAllByRole('option')[0])
    expect(box().value).toBe('deepseek-flash')
  })

  it('Escape closes without changing the value; Tab leaves; click outside closes', () => {
    const onChange = vi.fn()
    render(
      <div>
        <Harness onChange={onChange} initial="llama-3" />
        <button>ailleurs</button>
      </div>,
    )
    open()
    type('qwen')
    fireEvent.keyDown(box(), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(box().value).toBe('Llama 3')
    open()
    fireEvent.keyDown(box(), { key: 'Tab' })
    expect(screen.queryByRole('listbox')).toBeNull()
    open()
    fireEvent.mouseDown(screen.getByText('ailleurs'))
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('offers the empty choice when noneLabel is given', () => {
    const onChange = vi.fn()
    render(<Harness noneLabel="Aucun" initial="llama-3" onChange={onChange} />)
    open()
    const first = screen.getAllByRole('option')[0]
    expect(first.textContent).toContain('Aucun')
    fireEvent.click(first)
    expect(onChange).toHaveBeenCalledWith('')
    expect(box().value).toBe('Aucun')
  })

  it('allowCustom offers « Utiliser “xyz” » last, and only when the text is not an option', () => {
    const onChange = vi.fn()
    render(<Harness allowCustom onChange={onChange} />)
    open()
    expect(names().some((n) => n?.includes('Utiliser'))).toBe(false)
    type('llama-3')
    expect(names().some((n) => n?.includes('Utiliser'))).toBe(false)
    type('xyz')
    // The empty state is still said, above the offer to use the text as is.
    expect(screen.getByText('Aucun modèle ne correspond à « xyz »')).toBeTruthy()
    const last = screen.getAllByRole('option').at(-1)!
    expect(last.textContent).toBe('Utiliser “xyz”')
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('xyz')
    expect(box().value).toBe('xyz')
  })

  it('keeps and shows a value that is not in the list', () => {
    render(<Harness allowCustom initial="mon-modele" />)
    expect(box().value).toBe('mon-modele')
    open()
    expect(screen.getByText(/hors liste/)).toBeTruthy()
  })

  it('is disabled and does not open', () => {
    render(<Harness disabled />)
    expect(box().disabled).toBe(true)
    fireEvent.click(box())
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('shows a loading state', () => {
    render(<Harness options={[]} loading />)
    open()
    expect(within(screen.getByRole('listbox')).getByText('Chargement…')).toBeTruthy()
    expect(box().closest('[aria-busy="true"]')).toBeTruthy()
  })

  it('groups options and skips disabled ones from the keyboard', () => {
    const onChange = vi.fn()
    render(
      <Harness
        onChange={onChange}
        options={[
          { value: 'a', label: 'A', group: 'G1', disabled: true },
          { value: 'b', label: 'B', group: 'G1' },
          { value: 'c', label: 'C', group: 'G2' },
        ]}
      />,
    )
    open()
    expect(screen.getByText('G1')).toBeTruthy()
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('b')
    open()
    fireEvent.click(screen.getByText('A'))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('matches the group name, and the keywords', () => {
    render(
      <Harness
        options={[{ value: 'x', label: 'chat', group: 'DeepSeek', keywords: ['alias-rapide'] }]}
      />,
    )
    open()
    type('deepseek')
    expect(names().length).toBe(1)
    type('rapide')
    expect(names().length).toBe(1)
  })
})
