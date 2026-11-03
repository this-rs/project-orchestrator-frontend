// ============================================================================
// organicGroups — tests
// ============================================================================

import { describe, expect, it } from 'vitest'
import {
  buildOrganicGroups,
  isParentGroup,
  type OrganicEdge,
  type OrganicGroup,
  type OrganicNode,
} from './organicGroups'

function node(id: string, entityType: string, extra?: Partial<OrganicNode>): OrganicNode {
  return { id, entityType, ...extra }
}

function edge(source: string, target: string, relationType: string): OrganicEdge {
  return { source, target, relationType }
}

/** Owner groups (the ones that actually own nodes); parents are aggregators. */
function owners(groups: OrganicGroup[]): OrganicGroup[] {
  return groups.filter((g) => !isParentGroup(g))
}

describe('buildOrganicGroups', () => {
  it('conserve tous les identifiants réels (aucun nœud perdu)', () => {
    const nodes = [
      node('f1', 'file', { communityId: 7 }),
      node('f2', 'file', { communityId: 7 }),
      node('fn1', 'function', { communityId: 7 }),
      node('s1', 'skill'),
      node('n1', 'note', { layer: 'knowledge' }),
      node('n2', 'note', { layer: 'knowledge' }),
      node('p1', 'plan'),
      node('t1', 'task'),
      node('st1', 'step'),
      node('d1', 'decision', { layer: 'knowledge' }),
      node('c1', 'constraint', { layer: 'knowledge' }),
    ]
    const edges = [
      edge('s1', 'n1', 'HAS_MEMBER'),
      edge('s1', 'n2', 'HAS_MEMBER'),
      edge('p1', 't1', 'HAS_TASK'),
      edge('t1', 'st1', 'HAS_STEP'),
    ]
    const groups = buildOrganicGroups(nodes, edges)

    // Every node is owned by exactly one owner group.
    const seen = new Map<string, string>()
    for (const g of owners(groups)) {
      for (const m of g.members) {
        expect(seen.has(m), `nœud ${m} présent dans plusieurs groupes`).toBe(false)
        seen.set(m, g.id)
      }
    }
    expect([...seen.keys()].sort()).toEqual(nodes.map((n) => n.id).sort())
  })

  it('conserve les effectifs par type (somme des byType = effectifs globaux)', () => {
    const nodes = [
      node('f1', 'file', { communityId: 1 }),
      node('f2', 'file', { communityId: 1 }),
      node('s1', 'skill'),
      node('n1', 'note'),
      node('p1', 'plan'),
      node('t1', 'task'),
      node('st1', 'step'),
      node('st2', 'step'),
      node('d1', 'decision'),
    ]
    const edges = [
      edge('s1', 'n1', 'HAS_MEMBER'),
      edge('p1', 't1', 'HAS_TASK'),
      edge('t1', 'st1', 'HAS_STEP'),
      edge('t1', 'st2', 'HAS_STEP'),
    ]
    const groups = buildOrganicGroups(nodes, edges)

    const global = new Map<string, number>()
    for (const n of nodes) global.set(n.entityType, (global.get(n.entityType) ?? 0) + 1)

    const summed = new Map<string, number>()
    for (const g of owners(groups)) {
      for (const [t, c] of g.byType) summed.set(t, (summed.get(t) ?? 0) + c)
    }
    expect(summed).toEqual(global)
  })

  it('un skill avec HAS_MEMBER produit un organite contenant ses membres et rien d’autre', () => {
    const nodes = [node('s1', 'skill'), node('n1', 'note'), node('n2', 'note'), node('n3', 'note')]
    const edges = [edge('s1', 'n1', 'HAS_MEMBER'), edge('s1', 'n2', 'HAS_MEMBER')]
    const groups = buildOrganicGroups(nodes, edges)

    const skill = groups.find((g) => g.kind === 'skill' && g.id === 'skill:s1')
    expect(skill).toBeDefined()
    expect(skill!.members).toEqual(['n1', 'n2', 's1'])
    expect(skill!.count).toBe(3)
    // The unrelated note is NOT part of the organite.
    expect(skill!.members).not.toContain('n3')
  })

  it('un nœud sans relation n’est rattaché à rien (aucun lien fictif)', () => {
    const nodes = [node('lonely', 'note'), node('s1', 'skill')]
    const edges: OrganicEdge[] = []
    const groups = buildOrganicGroups(nodes, edges)

    const home = groups.find((g) => g.members.includes('lonely'))
    expect(home).toBeDefined()
    expect(home!.kind).toBe('amas')
    // No organite claims it.
    for (const g of groups) {
      if (['skill', 'protocol', 'plan', 'task'].includes(g.kind)) {
        expect(g.members).not.toContain('lonely')
      }
    }
  })

  it('une famille minoritaire (1 seul nœud) garde son propre groupe', () => {
    const nodes = [node('solo', 'skill'), node('f1', 'file', { communityId: 1 })]
    const edges: OrganicEdge[] = []
    const groups = buildOrganicGroups(nodes, edges)

    const skill = groups.find((g) => g.id === 'skill:solo')
    expect(skill).toBeDefined()
    expect(skill!.members).toEqual(['solo'])
    expect(skill!.count).toBe(1)
    // Its macro representative still exists at the top level.
    expect(groups.find((g) => g.id === 'parent:skill')).toBeDefined()
  })

  it('est déterministe quel que soit l’ordre des nœuds et des arêtes', () => {
    const nodes = [
      node('a', 'file', { communityId: 1 }),
      node('b', 'file', { communityId: 2 }),
      node('s', 'skill'),
      node('n', 'note'),
      node('p', 'plan'),
      node('t', 'task'),
      node('st', 'step'),
    ]
    const edges = [
      edge('s', 'n', 'HAS_MEMBER'),
      edge('p', 't', 'HAS_TASK'),
      edge('t', 'st', 'HAS_STEP'),
    ]
    const shuffledNodes = [...nodes].reverse()
    const shuffledEdges = [...edges].reverse()
    expect(buildOrganicGroups(nodes, edges)).toEqual(buildOrganicGroups(shuffledNodes, shuffledEdges))
  })

  it('ne déduit jamais un organite depuis des libellés qui se ressemblent', () => {
    const nodes = [node('skill', 'skill'), node('skill-member-1', 'note')]
    const edges: OrganicEdge[] = []
    const groups = buildOrganicGroups(nodes, edges)

    const skill = groups.find((g) => g.id === 'skill:skill')
    expect(skill!.members).toEqual(['skill']) // the lookalike is not inferred
    const lookalikeHome = groups.find((g) => g.members.includes('skill-member-1'))
    expect(lookalikeHome!.kind).toBe('amas')
  })

  it('construit la hiérarchie plan → tâche → étape et le parent macro', () => {
    const nodes = [
      node('p1', 'plan'),
      node('t1', 'task'),
      node('t2', 'task'),
      node('st1', 'step'),
    ]
    const edges = [
      edge('p1', 't1', 'HAS_TASK'),
      edge('p1', 't2', 'HAS_TASK'),
      edge('t1', 'st1', 'HAS_STEP'),
    ]
    const groups = buildOrganicGroups(nodes, edges)

    const plan = groups.find((g) => g.id === 'plan:p1')
    const task1 = groups.find((g) => g.id === 'task:t1')
    const task2 = groups.find((g) => g.id === 'task:t2')
    expect(task1!.parentId).toBe('plan:p1')
    expect(task2!.parentId).toBe('plan:p1')
    expect(task1!.members).toEqual(['st1', 't1'])
    expect(task2!.members).toEqual(['t2'])
    expect(plan!.members).toEqual(['p1']) // the plan owns only its own node

    // The macro parent conserves the count and the real members of the subtree.
    const pplan = groups.find((g) => g.id === 'parent:plan')
    expect(pplan!.count).toBe(4)
    expect(pplan!.members).toEqual(['p1', 'st1', 't1', 't2'])
  })

  it('un protocole BELONGS_TO_SKILL se niche sous le skill', () => {
    const nodes = [node('sk', 'skill'), node('pr', 'protocol'), node('st', 'protocol_state')]
    const edges = [edge('pr', 'sk', 'BELONGS_TO_SKILL'), edge('pr', 'st', 'HAS_STATE')]
    const groups = buildOrganicGroups(nodes, edges)

    const protocol = groups.find((g) => g.id === 'protocol:pr')
    expect(protocol!.parentId).toBe('skill:sk')
    expect(protocol!.members).toEqual(['pr', 'st'])

    const pskill = groups.find((g) => g.id === 'parent:skill')
    expect(pskill!.members).toEqual(['pr', 'sk', 'st'])
  })
})
