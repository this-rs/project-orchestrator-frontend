import { describe, it, expect } from 'vitest'
import { createVascularLinks, layerSpecs, MEMBRANE_FACING_ALPHA, MEMBRANE_EDGE_ALPHA } from './linkVascularRenderer'
import { synthGraph } from './linkVascularFixture'

type Attr = { array: Float32Array }
type Geom = { attributes: Record<string, Attr>; index: { array: ArrayLike<number> } }

function meshOf(r: ReturnType<typeof createVascularLinks>) {
  const group = r!.object as unknown as { children: { geometry: Geom; material: { side: number } }[] }
  return group.children[0]
}

/**
 * Le tube se lit par son VOLUME : bord lumineux (rim), diffusion du bon côté.
 * Les deux supposent que le mur PROCHE est dessiné et que sa normale regarde la
 * caméra. Avec un index tourné vers l'intérieur, FrontSide ne dessinait que le
 * mur du FOND : normale opposée à la vue, rim = 1 partout, diffusion à l'envers.
 */
describe('enroulement des tubes vasculaires', () => {
  it('chaque triangle regarde vers l’extérieur (normale géométrique · aNormal > 0)', () => {
    const { nodes, links } = synthGraph(1600, [0, 0, 0], 2)
    const r = createVascularLinks(nodes, links)!
    const g = meshOf(r).geometry
    const P = g.attributes.position.array
    const N = g.attributes.aNormal.array
    const I = g.index.array
    let outward = 0
    let inward = 0
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2]
      const e1x = P[b * 3] - P[a * 3], e1y = P[b * 3 + 1] - P[a * 3 + 1], e1z = P[b * 3 + 2] - P[a * 3 + 2]
      const e2x = P[c * 3] - P[a * 3], e2y = P[c * 3 + 1] - P[a * 3 + 1], e2z = P[c * 3 + 2] - P[a * 3 + 2]
      const nx = e1y * e2z - e1z * e2y
      const ny = e1z * e2x - e1x * e2z
      const nz = e1x * e2y - e1y * e2x
      const area = Math.hypot(nx, ny, nz)
      // Pôles des capsules : triangles de surface nulle, sans orientation.
      if (!(area > 1e-9)) continue
      // Normale moyenne des trois sommets : la normale d'anneau de `a` seule
      // est tangente au bord d'un pôle de capsule.
      const mx = N[a * 3] + N[b * 3] + N[c * 3]
      const my = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1]
      const mz = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2]
      const dot = (nx * mx + ny * my + nz * mz) / area
      if (dot > 0) outward++
      else inward++
    }
    expect(outward).toBeGreaterThan(10_000)
    expect(inward).toBe(0)
    // FrontSide (0) : c'est l'enroulement qui décide de ce qui est dessiné.
    expect(meshOf(r).material.side).toBe(0)
  })
})

/**
 * Le mur proche passe maintenant DEVANT le cœur. Une membrane est une couche
 * FINE : transparente de face, lisible sur ses bords (Fresnel). Au centre du
 * tube, les trois peaux réunies ne voilent presque rien.
 */
describe('membranes fines', () => {
  const membrane = layerSpecs(5).filter((s) => s.kind === 'halo' || s.kind === 'sheath' || s.kind === 'structure')

  it('voile le cœur de moins de 10 % au centre du tube, à pleine présence', () => {
    let through = 1
    for (const m of membrane) through *= 1 - Math.min(1, m.alpha * MEMBRANE_FACING_ALPHA)
    expect(1 - through).toBeLessThan(0.1)
  })

  it('reste lisible sur la silhouette : le bord est plusieurs fois plus opaque que la face', () => {
    expect(MEMBRANE_FACING_ALPHA + MEMBRANE_EDGE_ALPHA).toBeGreaterThanOrEqual(4 * MEMBRANE_FACING_ALPHA)
  })
})
