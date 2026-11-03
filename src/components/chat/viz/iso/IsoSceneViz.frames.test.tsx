/**
 * `frames` — un bloc porte plusieurs VERSIONS d'un même objet et les rejoue.
 *
 * Ce test couvre ce que la compilation seule ne peut pas prouver : que le lecteur change bien de version dans le
 * temps, et que le compteur suit. Le rendu 3D lui-même (`IsoGL`) est simulé : on ne teste pas WebGL ici, on teste la
 * mécanique du bloc.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'

const stage = vi.hoisted(() => ({ mounts: [] as string[] }))

vi.mock('@/vendor/three-iso/IsoGL', () => ({
  default: (props: { label?: string }) => {
    stage.mounts.push(props.label ?? '')
    return <div data-testid="iso-stage">{props.label}</div>
  },
}))

import IsoSceneViz from './IsoSceneViz'

const sphere = { kind: 'sphere', r: 0.5, at: [0, 0, 0.5] }
const withSlab = { kind: 'group', children: [sphere, { kind: 'slab', size: [1, 0.3, 0.3], at: [0, 0, 0.2] }] }

describe('IsoSceneViz — plusieurs versions', () => {
  beforeEach(() => {
    stage.mounts.length = 0
    vi.useFakeTimers()
    // jsdom n'implémente pas matchMedia : le bloc lit la préférence de mouvement réduit au montage.
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('affiche la première version et son compteur', () => {
    render(<IsoSceneViz data={{ title: 'Pièce', frames: [{ ast: sphere }, { ast: withSlab }] } as never} fallbackText="3D" />)
    expect(screen.getByTestId('iso-scene').getAttribute('data-frames')).toBe('2')
    expect(screen.getByTestId('iso-scene').getAttribute('data-frame')).toBe('0')
    expect(screen.getByText('1 / 2')).toBeTruthy()
    expect(stage.mounts.length).toBe(1)
  })

  it('passe à la version suivante après frameMs, et REMONTE le rendu (donc la construction repart)', () => {
    render(<IsoSceneViz data={{ frames: [{ ast: sphere }, { ast: withSlab }], frameMs: 1000 } as never} fallbackText="3D" />)
    expect(stage.mounts.length).toBe(1)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByTestId('iso-scene').getAttribute('data-frame')).toBe('1')
    expect(screen.getByText('2 / 2')).toBeTruthy()
    expect(stage.mounts.length).toBe(2)
    // REMONTER le rendu est le point : c'est ce remontage qui fait repartir la construction (les ouvriers).
    expect(stage.mounts.length).toBe(2)
  })

  it('boucle sur la première version', () => {
    render(<IsoSceneViz data={{ frames: [{ ast: sphere }, { ast: withSlab }], frameMs: 1000 } as never} fallbackText="3D" />)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByTestId('iso-scene').getAttribute('data-frame')).toBe('0')
  })
})
