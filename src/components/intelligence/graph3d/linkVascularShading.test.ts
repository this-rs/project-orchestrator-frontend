import { describe, it, expect } from 'vitest'
import { CORE_SCREEN_FLOOR_PX, createVascularLinks, layerSpecs, MEMBRANE_FACING_ALPHA, MEMBRANE_EDGE_ALPHA } from './linkVascularRenderer'
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

/**
 * L'opacité d'un faisceau suit computeLinkAlpha (densité, focus, sélection,
 * légende) : un lien atténué DOIT s'éteindre. Un plancher fixe (0,6) laissait
 * tous les tubes à 0,42 quel que soit le focus.
 */
describe('opacité pilotée par le style', () => {
  const maxAlpha = (r: ReturnType<typeof createVascularLinks>) => {
    let m = 0
    for (const v of meshOf(r).geometry.attributes.aAlpha.array) m = Math.max(m, v)
    return m
  }

  it('un style presque éteint (a = 0,02) éteint toutes les couches', () => {
    const { nodes, links } = synthGraph(1600, [0, 0, 0], 2)
    const r = createVascularLinks(nodes, links)!
    r.updateColors(() => ({ r: 1, g: 1, b: 1, a: 0.02 }))
    expect(maxAlpha(r)).toBeLessThanOrEqual(0.05)
  })

  it('reste monotone : un lien plus présent est plus opaque, jamais au-delà de la spec', () => {
    const { nodes, links } = synthGraph(1600, [0, 0, 0], 2)
    const r = createVascularLinks(nodes, links)!
    const at = (a: number) => {
      r.updateColors(() => ({ r: 1, g: 1, b: 1, a }))
      return maxAlpha(r)
    }
    const dim = at(0.02)
    const rest = at(0.12)
    const full = at(1)
    expect(rest).toBeGreaterThan(dim * 3)
    expect(full).toBeGreaterThan(rest)
    expect(full).toBeLessThanOrEqual(layerSpecs(5).at(-1)!.alpha + 1e-6)
  })
})

/**
 * Le plancher de rayon écran du cœur est exprimé en pixels CSS. Exprimé en
 * pixels du tampon, 0,6 px valait 0,4 px CSS à un ratio de 1,5 (sous-pixel,
 * scintillement) et changeait de taille à chaque mouvement du ratio adaptatif.
 */
describe('plancher écran du cœur en pixels CSS', () => {
  type Uniforms = Record<string, { value: number }>
  const setup = () => {
    const { nodes, links } = synthGraph(400, [0, 0, 0], 2)
    const r = createVascularLinks(nodes, links)!
    const mesh = (r.object as unknown as { children: { onBeforeRender: (...a: unknown[]) => void; material: { uniforms: Uniforms } }[] }).children[0]
    const render = (ratio: number) => {
      const fake = {
        getPixelRatio: () => ratio,
        getDrawingBufferSize: (v: { set: (x: number, y: number) => void }) => { v.set(1280 * ratio, 720 * ratio); return v },
      }
      mesh.onBeforeRender(fake, null, null, null, null, null)
      const u = mesh.material.uniforms
      // Rayon plancher en fraction de la hauteur d'écran : ce que voit l'œil.
      return u.uPxFloor.value / u.uViewportH.value
    }
    return { r, render, uniforms: mesh.material.uniforms }
  }

  it('garde la même taille à l’écran quel que soit le ratio de pixels', () => {
    const { render } = setup()
    const at1 = render(1)
    expect(at1).toBeCloseTo(CORE_SCREEN_FLOOR_PX / 720, 9)
    expect(render(1.5)).toBeCloseTo(at1, 9)
    expect(render(2)).toBeCloseTo(at1, 9)
  })

  it('n’est jamais sous-pixel en CSS', () => {
    expect(2 * CORE_SCREEN_FLOOR_PX).toBeGreaterThanOrEqual(1)
  })

  it('setPixelRatio impose le ratio (rendu dans une cible d’une autre résolution)', () => {
    const { r, render, uniforms } = setup()
    r.setPixelRatio!(2)
    render(1)
    expect(uniforms.uPxFloor.value).toBeCloseTo(2 * CORE_SCREEN_FLOOR_PX, 9)
  })
})
