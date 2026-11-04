import { describe, it, expect } from 'vitest'
import { mapBackendEvent } from './useGraphWebSocket'

type Raw = Parameters<typeof mapBackendEvent>[0]

describe('mapBackendEvent — node_deleted', () => {
  it('maps a deleted node to graph.node_deleted with its id', () => {
    const raw = { type: 'node_deleted', layer: 'knowledge', node_id: 'note-42', target_id: null, edge_type: null, delta: null } as unknown as Raw
    expect(mapBackendEvent(raw)).toEqual({ type: 'graph.node_deleted', node_id: 'note-42' })
  })

  it('keeps node_created unchanged next to it', () => {
    const raw = { type: 'node_created', layer: 'code', node_id: 'src/a.ts', delta: { label: 'a.ts' } } as unknown as Raw
    const ev = mapBackendEvent(raw)
    expect(ev?.type).toBe('graph.node_created')
  })
})
