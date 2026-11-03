import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { BundleInspector } from './BundleInspector'
import { buildCorridors } from './graph3d/linkRouting'
import type { Graph3DLink } from './graph3d/useGraph3DLayout'

const mk = (i: number, relationType: string): Graph3DLink =>
  ({
    source: `s${i}`, target: `t${i}`, relationType, layer: 'code', color: '#fff', width: 1,
    particles: 0, particleSpeed: 0, isInterCommunity: true, sourceCommunityId: 1, targetCommunityId: 2,
  }) as Graph3DLink

function corridor(n: number) {
  const links = Array.from({ length: n }, (_, i) => mk(i, i % 2 ? 'CALLS' : 'IMPORTS'))
  const c = buildCorridors(links)
  expect(c.length).toBe(1)
  return c[0]
}

describe('BundleInspector', () => {
  afterEach(cleanup)

  it('affiche le compte exact et les familles', () => {
    render(<BundleInspector corridor={corridor(10)} onClose={() => {}} />)
    expect(screen.getByTestId('bundle-exact-count').textContent).toContain('10')
    expect(screen.getByText(/CALLS : 5/)).toBeTruthy()
    expect(screen.getByText(/IMPORTS : 5/)).toBeTruthy()
    expect(screen.queryByText(/autres/)).toBeNull()
  })

  it('tronque à 50 relations avec « + N autres »', () => {
    render(<BundleInspector corridor={corridor(60)} onClose={() => {}} />)
    expect(screen.getAllByTestId('bundle-link').length).toBe(50)
    expect(screen.getByText('+ 10 autres')).toBeTruthy()
  })

  it('le bouton de fermeture appelle onClose', () => {
    const onClose = vi.fn()
    render(<BundleInspector corridor={corridor(3)} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
