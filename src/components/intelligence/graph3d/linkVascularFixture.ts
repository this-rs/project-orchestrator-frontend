// Graphe synthétique partagé par les tests du renderer vasculaire.

/** Six communautés écartées, quatre familles : assez pour des ports, des sous-moyeux et des voies. */
export function synthGraph(n: number, offset: [number, number, number] = [0, 0, 0]) {
  const nodes = Array.from({ length: n }, (_, i) => ({
    id: `n${i}`, label: '', entityType: 'file', layer: 'code',
    x: Math.cos(i * 0.7) * 200 + (i % 6) * 300 + offset[0],
    y: Math.sin(i * 1.3) * 200 + offset[1],
    z: Math.cos(i * 0.21) * 200 + offset[2],
    communityId: i % 6, data: {},
  })) as never[]
  const links = Array.from({ length: n * 2 }, (_, i) => ({
    source: `n${(i * 7) % n}`, target: `n${(i * 13 + 5) % n}`,
    relationType: ['IMPORTS', 'CALLS', 'CO_CHANGED', 'TOUCHES'][i % 4], layer: 'code',
    sourceCommunityId: ((i * 7) % n) % 6, targetCommunityId: ((i * 13 + 5) % n) % 6,
    color: '#fff', width: 1, particles: 0, particleSpeed: 0, isInterCommunity: false,
  })) as never[]
  return { nodes, links }
}
