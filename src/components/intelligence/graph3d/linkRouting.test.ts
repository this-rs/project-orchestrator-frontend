import { describe, it, expect } from 'vitest'
import { buildCorridors, corridorIsComplete, UNKNOWN_RELATION } from './linkRouting'
import type { Graph3DLink } from './useGraph3DLayout'

/** Fabrique un lien réel, avec les champs obligatoires du type Graph3DLink. */
const link = (
  source: string,
  target: string,
  relationType = 'IMPORTS',
  sourceCommunityId?: number,
  targetCommunityId?: number,
): Graph3DLink => ({
  source,
  target,
  relationType,
  layer: 'fabric',
  color: 'rgba(148,163,184,0.35)',
  width: 1,
  particles: 0,
  particleSpeed: 0,
  isInterCommunity:
    sourceCommunityId !== undefined &&
    targetCommunityId !== undefined &&
    sourceCommunityId !== targetCommunityId,
  sourceCommunityId,
  targetCommunityId,
})

describe('buildCorridors — mutualisation organique sans invention', () => {
  it('fond deux types de relations entre les mêmes extrémités en UN corridor à DEUX familles', () => {
    const corridors = buildCorridors([
      link('a', 'b', 'IMPORTS', 1, 2),
      link('a', 'b', 'CALLS', 1, 2),
    ])
    expect(corridors).toHaveLength(1)
    const corridor = corridors[0]
    expect(corridor.families).toHaveLength(2)
    const byName = new Map(corridor.families.map((f) => [f.relation, f]))
    expect(byName.get('IMPORTS')?.exactCount).toBe(1n)
    expect(byName.get('CALLS')?.exactCount).toBe(1n)
  })

  it('ne fabrique AUCUN corridor entre des ensembles sans lien réel', () => {
    const corridors = buildCorridors([
      link('a', 'b', 'IMPORTS', 1, 1), // intra-communauté 1
      link('c', 'd', 'CALLS', 2, 2), //   intra-communauté 2
    ])
    // Les communautés 1 et 2 n'ont aucun lien entre elles : aucun corridor 1↔2.
    expect(
      corridors.some(
        (c) => (c.from === '1' && c.to === '2') || (c.from === '2' && c.to === '1'),
      ),
    ).toBe(false)
    // Les deux corridors intra existent, eux, et rien d'autre.
    expect(corridors.map((c) => c.key).sort()).toEqual(['1\u00001', '2\u00002'])
  })

  it("garantit que la somme exacte des familles égale le compte du corridor et que corridorIsComplete est vrai", () => {
    const corridors = buildCorridors([
      link('a', 'b', 'IMPORTS', 1, 2),
      link('a', 'b', 'IMPORTS', 1, 2),
      link('a', 'b', 'CALLS', 1, 2),
      link('a', 'b', 'CO_CHANGED', 1, 2),
      link('x', 'y', 'AFFECTS', 3, 4),
    ])
    expect(corridors.length).toBeGreaterThan(0)
    for (const corridor of corridors) {
      const sum = corridor.families.reduce((acc, f) => acc + f.exactCount, 0n)
      expect(sum).toBe(corridor.magnitude.exactCount)
      expect(corridorIsComplete(corridor)).toBe(true)
    }
    // Premier corridor (clé triée 1↔2) : 2 IMPORTS + 1 CALLS + 1 CO_CHANGED = 4.
    expect(corridors[0].magnitude.exactCount).toBe(4n)
  })

  it('donne la MÊME clé et UN seul corridor pour a→b et b→a', () => {
    const corridors = buildCorridors([
      link('a', 'b', 'IMPORTS', 1, 2),
      link('b', 'a', 'CALLS', 2, 1), // même paire de communautés, sens inverse
    ])
    expect(corridors).toHaveLength(1)
    expect(corridors[0].key).toBe('1\u00002')
    expect(corridors[0].from).toBe('1')
    expect(corridors[0].to).toBe('2')
  })

  it("est déterministe : l'ordre d'entrée mélangé donne une sortie identique", () => {
    const base = [
      link('a', 'b', 'IMPORTS', 1, 2),
      link('a', 'b', 'CALLS', 1, 2),
      link('c', 'd', 'AFFECTS', 3, 4),
      link('e', 'f', 'TOUCHES', 5, 6),
      link('a', 'b', 'CO_CHANGED', 1, 2),
    ]
    const reversed = [...base].reverse()
    const rotated = [...base.slice(2), ...base.slice(0, 2)]
    const expected = buildCorridors(base)
    expect(buildCorridors(reversed)).toEqual(expected)
    expect(buildCorridors(rotated)).toEqual(expected)
  })

  it('reste UN objet pour 10⁶ liens : magnitudeOrder 6, compte exact, aucune primitive par lien', () => {
    const many: Graph3DLink[] = []
    for (let i = 0; i < 1_000_000; i++) many.push(link('a', 'b', 'IMPORTS', 1, 2))
    const corridors = buildCorridors(many)
    // Un seul corridor, pas un million de primitives.
    expect(corridors).toHaveLength(1)
    const corridor = corridors[0]
    expect(corridor.magnitude.magnitudeOrder).toBe(6)
    expect(corridor.magnitude.exactCount).toBe(1_000_000n)
    expect(corridor.links).toHaveLength(1_000_000)
    expect(corridor.families).toHaveLength(1)
    expect(corridor.families[0].exactCount).toBe(1_000_000n)
  })

  it("range un lien sans type de relation dans la famille explicite UNKNOWN, sans perte", () => {
    const corridors = buildCorridors([
      link('a', 'b', '', 1, 2), // aucun type de relation
      link('a', 'b', 'IMPORTS', 1, 2),
    ])
    const corridor = corridors[0]
    const unknown = corridor.families.find((f) => f.relation === UNKNOWN_RELATION)
    expect(unknown).toBeDefined()
    expect(unknown?.exactCount).toBe(1n)
    // Aucun compte perdu : UNKNOWN (1) + IMPORTS (1) = 2.
    expect(corridorIsComplete(corridor)).toBe(true)
    expect(corridor.magnitude.exactCount).toBe(2n)
  })

  it('calcule la share en bigint (part exacte) et trie les familles par nom', () => {
    const corridors = buildCorridors([
      link('a', 'b', 'CALLS', 1, 2),
      link('a', 'b', 'IMPORTS', 1, 2),
      link('a', 'b', 'IMPORTS', 1, 2),
      link('a', 'b', 'IMPORTS', 1, 2),
    ])
    const corridor = corridors[0]
    // Triées par nom : CALLS avant IMPORTS.
    expect(corridor.families.map((f) => f.relation)).toEqual(['CALLS', 'IMPORTS'])
    expect(corridor.families[0].exactCount).toBe(1n)
    expect(corridor.families[1].exactCount).toBe(3n)
    expect(corridor.families[0].share).toBeCloseTo(0.25, 12)
    expect(corridor.families[1].share).toBeCloseTo(0.75, 12)
    // Les parts sont un complément exact : elles somment à 1.
    expect(corridor.families[0].share + corridor.families[1].share).toBeCloseTo(1, 12)
  })
})
