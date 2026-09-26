import type { NeighborhoodResponse } from '@/services/neighborhood'

/** Realistic neighborhood of a note: center + 2 rings, truncated. */
export function noteNeighborhood(): NeighborhoodResponse {
  return {
    center: { id: 'n1', type: 'note' },
    nodes: [
      {
        id: 'n1',
        type: 'note',
        label: 'Graph render budget',
        weight: 1,
        depth: 0,
        layer: 'knowledge',
      },
      {
        id: 'd1',
        type: 'decision',
        label: 'Render on demand',
        subtitle: 'accepted',
        weight: 0.9,
        depth: 1,
        layer: 'knowledge',
      },
      {
        id: 'f1',
        type: 'file',
        label: 'useRenderLoop.ts',
        subtitle: 'src/components/intelligence',
        weight: 0.7,
        depth: 1,
        layer: 'code',
      },
      {
        id: 't1',
        type: 'task',
        label: 'Stop 60 fps idle loop',
        weight: 0.5,
        depth: 1,
        layer: 'planning',
      },
      { id: 'fn1', type: 'function', label: 'invalidate', weight: 0.3, depth: 1, layer: 'code' },
      {
        id: 'p1',
        type: 'plan',
        label: 'Mobile perf plan',
        weight: 0.6,
        depth: 2,
        layer: 'planning',
      },
      {
        id: 'f2',
        type: 'file',
        label: 'IntelligenceGraph3D.tsx',
        weight: 0.4,
        depth: 2,
        layer: 'code',
      },
      {
        id: 'c1',
        type: 'commit',
        label: 'e645a28 perf(graph3d)',
        weight: 0.2,
        depth: 2,
        layer: 'code',
      },
      { id: 's1', type: 'skill', label: 'Rendering', weight: 0.15, depth: 2, layer: 'neural' },
    ],
    edges: [
      { source: 'n1', target: 'd1', rel: 'LINKED_TO', weight: 0.9, layer: 'knowledge' },
      { source: 'n1', target: 'f1', rel: 'ATTACHED_TO', weight: 0.7, layer: 'knowledge' },
      { source: 'n1', target: 't1', rel: 'LINKED_TO', weight: 0.5, layer: 'knowledge' },
      { source: 'n1', target: 'fn1', rel: 'ATTACHED_TO', weight: 0.3, layer: 'knowledge' },
      { source: 't1', target: 'p1', rel: 'HAS_TASK', weight: 0.6, layer: 'planning' },
      { source: 'f1', target: 'f2', rel: 'IMPORTS', weight: 0.4, layer: 'code' },
      { source: 'c1', target: 'f1', rel: 'TOUCHES', weight: 0.2, layer: 'code' },
      { source: 'f1', target: 's1', rel: 'HAS_MEMBER', weight: 0.15, layer: 'neural' },
    ],
    truncated: true,
    stats: {
      by_type: {
        note: 1,
        decision: 1,
        file: 5,
        task: 1,
        function: 4,
        plan: 1,
        commit: 12,
        skill: 2,
      },
      by_rel: { LINKED_TO: 2, ATTACHED_TO: 2, HAS_TASK: 1, IMPORTS: 1, TOUCHES: 1, HAS_MEMBER: 1 },
      total_before_limit: 27,
    },
  }
}

export function emptyNeighborhood(): NeighborhoodResponse {
  return {
    center: { id: 'n1', type: 'note' },
    nodes: [
      { id: 'n1', type: 'note', label: 'Lonely note', weight: 1, depth: 0, layer: 'knowledge' },
    ],
    edges: [],
    truncated: false,
    stats: { by_type: { note: 1 }, by_rel: {}, total_before_limit: 1 },
  }
}
