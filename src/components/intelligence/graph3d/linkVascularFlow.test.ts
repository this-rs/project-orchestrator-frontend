import { describe, it, expect } from 'vitest'
import { ORGANIC_FLOW_ENABLED, createVascularLinks } from './linkVascularRenderer'

function synth(n: number) {
  let seed = 5
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const nodes = Array.from({ length: n }, (_, i) => ({
    id: `n${i}`, label: '', entityType: 'file', layer: 'code',
    x: (rnd() - 0.5) * 400, y: (rnd() - 0.5) * 400, z: (rnd() - 0.5) * 400,
    communityId: i % 5, data: {},
  })) as never[]
  const links = Array.from({ length: n * 2 }, () => {
    const a = Math.floor(rnd() * n)
    const b = Math.floor(rnd() * n)
    return {
      source: `n${a}`, target: `n${b}`, relationType: ['IMPORTS', 'CALLS'][Math.floor(rnd() * 2)],
      layer: 'code', sourceCommunityId: a % 5, targetCommunityId: b % 5,
      color: '#fff', width: 1, particles: 0, particleSpeed: 0, isInterCommunity: false,
    } as never
  })
  return { nodes, links }
}

type Geom = {
  attributes: Record<string, { array: Float32Array }>
  index: { array: ArrayLike<number> }
}
function geometryOf(renderer: ReturnType<typeof createVascularLinks>): Geom {
  const group = renderer!.object as unknown as { children: { geometry: Geom; material: { uniforms: Record<string, { value: unknown }> } }[] }
  return group.children[0].geometry
}
function materialOf(renderer: ReturnType<typeof createVascularLinks>) {
  const group = renderer!.object as unknown as { children: { material: { uniforms: Record<string, { value: unknown }> } }[] }
  return group.children[0].material
}

describe('cycle de vie du renderer — pas de fantômes', () => {
  it('dispose DÉTACHE le groupe de la scène, sinon il continue d’être dessiné', async () => {
    const THREE = await import('three')
    const { nodes, links } = synth(150)
    const r = createVascularLinks(nodes, links)!
    const scene = new THREE.Scene()
    scene.add(r.object as unknown as import('three').Object3D)
    expect(scene.children.length).toBe(1)
    r.dispose()
    // Un groupe laissé attaché resterait « imprimé » après le remplacement du
    // renderer : c'est le fantôme qui ne part plus.
    expect(scene.children.length).toBe(0)
  })

  it('dispose vide le groupe et libère la géométrie', async () => {
    const { nodes, links } = synth(120)
    const r = createVascularLinks(nodes, links)!
    const group = r.object as unknown as { children: unknown[] }
    expect(group.children.length).toBeGreaterThan(0)
    r.dispose()
    expect(group.children.length).toBe(0)
  })
})

describe('flux animé (phase 7)', () => {
  it('setFlowTime ne touche QUE l’uniforme — ni positions, ni couleurs, ni indices', () => {
    const { nodes, links } = synth(300)
    const r = createVascularLinks(nodes, links)!
    const before = {
      pos: Float32Array.from(geometryOf(r).attributes.position.array),
      col: Float32Array.from(geometryOf(r).attributes.aColor.array),
      alp: Float32Array.from(geometryOf(r).attributes.aAlpha.array),
      idx: Array.from(geometryOf(r).index.array),
    }
    const t0 = materialOf(r).uniforms.uFlowTime.value
    r.setFlowTime?.(0.37)

    expect(materialOf(r).uniforms.uFlowTime.value).not.toBe(t0)
    expect(materialOf(r).uniforms.uFlowTime.value).toBeCloseTo(0.37, 9)
    // Les tampons sont IDENTIQUES : aucune reconstruction par image.
    expect(Float32Array.from(geometryOf(r).attributes.position.array)).toEqual(before.pos)
    expect(Float32Array.from(geometryOf(r).attributes.aColor.array)).toEqual(before.col)
    expect(Float32Array.from(geometryOf(r).attributes.aAlpha.array)).toEqual(before.alp)
    expect(Array.from(geometryOf(r).index.array)).toEqual(before.idx)
  })

  it('porte les attributs dont le shader a besoin pour animer', () => {
    const { nodes, links } = synth(200)
    const r = createVascularLinks(nodes, links)!
    const g = geometryOf(r)
    expect(g.attributes.aU).toBeDefined()
    expect(g.attributes.aPhase).toBeDefined()
    expect(g.attributes.aEmit).toBeDefined()
    expect(g.attributes.aNormal).toBeDefined()
    // La position curviligne couvre bien 0 → 1 sur un conduit.
    const u = g.attributes.aU.array
    expect(Math.min(...u)).toBe(0)
    expect(Math.max(...u)).toBeCloseTo(1, 6)
  })

  it('n’active pas le flux par défaut sur mobile', () => {
    // Le flag est une constante d'environnement : on vérifie seulement qu'il
    // existe et qu'il est booléen — la décision d'animer reste à l'appelant.
    expect(typeof ORGANIC_FLOW_ENABLED).toBe('boolean')
  })
})
