/**
 * Model field: searchable list over the provider catalog, free typing without one.
 *
 * Run with: npx vitest run src/components/settings/ModelField.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ModelField } from './ModelField'

const MODELS = [
  { id: 'deepseek-flash', capabilities: { tools: true, context_window: { value: 1048576, source: 'catalog' as const } } },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
]
const box = () => screen.getByRole('combobox', { name: 'Modèle' }) as HTMLInputElement

describe('ModelField', () => {
  it('lists the models with their capabilities and picks one', () => {
    const onChange = vi.fn()
    render(<ModelField label="Modèle" value="" onChange={onChange} models={MODELS} />)
    fireEvent.click(box())
    expect(screen.getByText('2 modèles')).toBeTruthy()
    expect(screen.getByText(/outils : oui · 1\s048\s576 tokens/)).toBeTruthy()
    fireEvent.click(screen.getByRole('option', { name: /deepseek-flash/ }))
    expect(onChange).toHaveBeenCalledWith('deepseek-flash')
  })

  it('searches by the id of a model that has a label', () => {
    render(<ModelField label="Modèle" value="" onChange={() => {}} models={MODELS} />)
    fireEvent.click(box())
    fireEvent.change(box(), { target: { value: 'v4-pro' } })
    expect(screen.getByRole('option', { name: /DeepSeek V4 Pro/ })).toBeTruthy()
    expect(screen.queryByRole('option', { name: /deepseek-flash/ })).toBeNull()
    expect(screen.getByText('1 sur 2')).toBeTruthy()
  })

  it('keeps a value the catalog does not list, says so, and never replaces it', () => {
    const onChange = vi.fn()
    render(<ModelField label="Modèle" value="gpt-9" onChange={onChange} models={MODELS} />)
    expect(box().value).toBe('gpt-9')
    expect(screen.getByText('« gpt-9 » n’est pas dans le catalogue de ce provider.')).toBeTruthy()
    fireEvent.click(box())
    fireEvent.keyDown(box(), { key: 'Escape' })
    expect(box().value).toBe('gpt-9')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('a model the endpoint does not list can still be typed and used', () => {
    const onChange = vi.fn()
    render(<ModelField label="Modèle" value="deepseek-flash" onChange={onChange} models={MODELS} />)
    fireEvent.click(box())
    fireEvent.change(box(), { target: { value: 'mon-modele' } })
    fireEvent.click(screen.getByRole('option', { name: 'Utiliser “mon-modele”' }))
    expect(onChange).toHaveBeenCalledWith('mon-modele')
  })

  it('the empty choice is offered when noneLabel is given', () => {
    const onChange = vi.fn()
    render(<ModelField label="Modèle" value="deepseek-flash" onChange={onChange} models={MODELS} noneLabel="Aucun" />)
    fireEvent.click(box())
    fireEvent.click(screen.getByRole('option', { name: 'Aucun' }))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('without a catalog it is a plain text field that reports every keystroke', () => {
    const onChange = vi.fn()
    render(<ModelField label="Modèle" value="" onChange={onChange} models={null} />)
    const input = screen.getByLabelText('Modèle')
    expect(screen.queryByRole('combobox')).toBeNull()
    fireEvent.change(input, { target: { value: 'abc' } })
    expect(onChange).toHaveBeenCalledWith('abc')
  })

  it('"Actualiser" is kept, and the field is disabled with the rest', () => {
    const onRefresh = vi.fn()
    render(<ModelField label="Modèle" value="" onChange={() => {}} models={MODELS} onRefresh={onRefresh} disabled />)
    expect(box().disabled).toBe(true)
    expect((screen.getByRole('button', { name: /Actualiser/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})
