import { describe, expect, it } from 'vitest'
import { PROPAGATION_HOPS, propagationPlan } from './livePulse'

/** Un petit graphe en étoile déterministe : 0 relié à 1..5, 1 relié à 6..8. */
const star = (id: string): string[] => {
  if (id === '0') return ['1', '2', '3', '4', '5']
  if (id === '1') return ['0', '6', '7', '8']
  return []
}

describe('propagationPlan', () => {
  it('part du nœud touché, jamais de lui-même', () => {
    const plan = propagationPlan('0', star)
    expect(plan.some((h) => h.id === '0')).toBe(false)
  })

  it('atteint les voisins directs au saut 1, leurs voisins au saut 2', () => {
    const plan = propagationPlan('0', star)
    expect(plan.filter((h) => h.hops === 1).map((h) => h.id).sort()).toEqual(['1', '2', '3', '4', '5'])
    expect(plan.filter((h) => h.hops === 2).map((h) => h.id).sort()).toEqual(['6', '7', '8'])
  })

  it('ne visite chaque nœud qu’une fois (un cycle ne boucle pas)', () => {
    const cyclic = (id: string) => (id === 'a' ? ['b', 'c'] : id === 'b' ? ['a', 'c'] : ['a', 'b'])
    const plan = propagationPlan('a', cyclic)
    const ids = plan.map((h) => h.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('respecte le plafond de nœuds (le coût par image reste borné)', () => {
    const wide = () => Array.from({ length: 5000 }, (_, i) => 'n' + i)
    const plan = propagationPlan('seed', wide, PROPAGATION_HOPS, 240)
    expect(plan.length).toBe(240)
  })

  it('respecte le nombre de sauts', () => {
    const chain = (id: string) => (id === '0' ? ['1'] : id === '1' ? ['2'] : id === '2' ? ['3'] : [])
    expect(propagationPlan('0', chain, 2).map((h) => h.id)).toEqual(['1', '2'])
  })

  it('est déterministe (même graphe, même plan)', () => {
    expect(propagationPlan('0', star)).toEqual(propagationPlan('0', star))
  })
})
