import { describe, it, expect, vi } from 'vitest'
import { createLinkRenderer } from './linkSegments'
import type { VascularLinkRenderer } from './linkVascularRenderer'
import { buildCorridors } from './linkRouting'
import { buildLinkSystem, fromCorridors } from './linkSystem'

/** Groupes écartés reliés par des agrégats (count > 1) : ce que dessine la vue d'ensemble. */
function aggregates(groups: number, linksN: number, seed = 1) {
  let s = seed
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647
  const nodes = Array.from({ length: groups }, (_, i) => ({
    id: `g${i}`, label: '', entityType: 'file', layer: 'code',
    x: (rnd() - 0.5) * 4000, y: (rnd() - 0.5) * 4000, z: (rnd() - 0.5) * 4000, communityId: i, data: {},
  })) as never[]
  const links = Array.from({ length: linksN }, (_, i) => {
    const a = Math.floor(rnd() * groups)
    let b = Math.floor(rnd() * groups)
    if (b === a) b = (a + 1) % groups
    return {
      source: `g${a}`, target: `g${b}`, relationType: ['IMPORTS', 'CALLS', 'CO_CHANGED', 'TOUCHES'][i % 4], layer: 'code',
      sourceCommunityId: a, targetCommunityId: b, count: 1 + Math.floor(rnd() ** 3 * 5000),
      color: '#fff', width: 1, particles: 0, particleSpeed: 0, isInterCommunity: true,
    } as never
  })
  return { nodes, links }
}

/**
 * createLinkRenderer passait `{}` : la distance caméra n'atteignait jamais
 * buildLinkSystem (LOD figé) et l'appelant ne pouvait pas réduire le plafond.
 */
describe('budget du renderer vasculaire, de bout en bout', () => {
  it('createLinkRenderer transmet le plafond de triangles', () => {
    const { nodes, links } = aggregates(60, 200)
    const r = createLinkRenderer(nodes, links, undefined, { maxTriangles: 30_000 }) as VascularLinkRenderer
    expect(r.stats).toBeDefined()
    expect(r.stats!.triangles).toBeGreaterThan(0)
    expect(r.stats!.triangles).toBeLessThanOrEqual(30_000)
  })

  it('createLinkRenderer transmet la distance caméra : de loin, moins de détail', () => {
    const { nodes, links } = aggregates(20, 40)
    const at = (cameraDistance: number) =>
      (createLinkRenderer(nodes, links, undefined, { cameraDistance, maxTriangles: 10_000_000 }) as VascularLinkRenderer).stats!.triangles
    expect(at(1e6)).toBeLessThan(at(100))
  })
})

describe('plafond mobile', () => {
  const loadAs = async (mobile: boolean) => {
    vi.resetModules()
    vi.doMock('./useRenderLoop', async (orig) => ({
      ...(await orig<typeof import('./useRenderLoop')>()),
      isMobileLikeDevice: () => mobile,
    }))
    const mod = await import('./linkVascularRenderer')
    vi.doUnmock('./useRenderLoop')
    return mod
  }

  it('un appareil mobile ne dépasse pas MOBILE_MAX_TRIANGLES, et l’estimation reste exacte', async () => {
    const mod = await loadAs(true)
    const { nodes, links } = aggregates(60, 600)
    const r = mod.createVascularLinks(nodes, links)!
    expect(r.stats!.triangles).toBeGreaterThan(0)
    expect(r.stats!.triangles).toBeLessThanOrEqual(mod.MOBILE_MAX_TRIANGLES)
    expect(mod.MOBILE_MAX_TRIANGLES).toBeLessThanOrEqual(60_000)
    const corridors = buildCorridors(links)
    const estimate = buildLinkSystem(fromCorridors(corridors), mod.vascularBudget(nodes, corridors)).stats.triangles
    expect(estimate).toBe(r.stats!.triangles)
  })

  it('un plafond explicite de l’appelant l’emporte, même sur mobile', async () => {
    const mod = await loadAs(true)
    const { nodes, links } = aggregates(60, 600)
    expect(mod.vascularBudget(nodes, buildCorridors(links), { maxTriangles: 12_345 }).maxTriangles).toBe(12_345)
  })

  it('un poste fixe garde le plafond par défaut', async () => {
    const mod = await loadAs(false)
    const { nodes, links } = aggregates(60, 600)
    expect(mod.vascularBudget(nodes, buildCorridors(links)).maxTriangles).toBeUndefined()
  })
})
