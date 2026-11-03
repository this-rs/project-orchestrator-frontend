/**
 * Commandes de lecture : éclater / couper / isoler une pièce. Les transformations existent dans le moteur ; ce test
 * vérifie qu'elles sont ATTEIGNABLES depuis le bloc, et que chaque clic recompile la scène (le rendu est remonté).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const stage = vi.hoisted(() => ({ mounts: 0 }))
vi.mock('@/vendor/three-iso/IsoGL', () => ({
  default: () => {
    stage.mounts++
    return <div data-testid="iso-stage" />
  },
}))

import IsoSceneViz from './IsoSceneViz'

const PIECE = {
  title: 'Pièce',
  bare: true,
  ast: {
    kind: 'group',
    children: [
      { kind: 'sphere', name: 'corps', r: 0.6, at: [0, 0, 0.6] },
      { kind: 'slab', name: 'semelle', size: [1.2, 0.3, 0.2], at: [0, 0, 0.1] },
    ],
  },
}

describe('IsoSceneViz — commandes de lecture', () => {
  beforeEach(() => {
    stage.mounts = 0
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    })
  })

  it('propose les trois gestes et la liste des pièces du moteur', () => {
    render(<IsoSceneViz data={PIECE as never} fallbackText="3D" />)
    expect(screen.getByTestId('iso-read-controls')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Éclater' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Couper' }).getAttribute('aria-pressed')).toBe('false')
    const select = screen.getByLabelText('Isoler une pièce') as HTMLSelectElement
    const values = [...select.options].map((o) => o.value).filter(Boolean)
    expect(values.length).toBeGreaterThan(0)
    expect(values).toContain('corps')
  })

  it('chaque geste recompile la scène (le rendu est remonté)', () => {
    render(<IsoSceneViz data={PIECE as never} fallbackText="3D" />)
    expect(stage.mounts).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Éclater' }))
    expect(screen.getByRole('button', { name: 'Éclater' }).getAttribute('aria-pressed')).toBe('true')
    expect(stage.mounts).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: 'Couper' }))
    expect(stage.mounts).toBe(3)
    const select = screen.getByLabelText('Isoler une pièce') as HTMLSelectElement
    const first = [...select.options].map((o) => o.value).filter(Boolean)[0]!
    fireEvent.change(select, { target: { value: first } })
    expect(stage.mounts).toBe(4)
  })
})
