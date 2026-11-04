import { describe, it, expect, vi } from 'vitest'
import {
  emitEntityPulse,
  entityIdsOfCrudEvent,
  entityIdsOfGraphEvent,
  entityPulseListenerCount,
  subscribeEntityPulse,
} from './livePulseBus'
import type { CrudEvent } from '@/types'

const crud = (partial: Partial<CrudEvent>): CrudEvent => ({
  entity_type: 'task',
  action: 'updated',
  entity_id: 't-1',
  payload: {},
  timestamp: '2026-11-02T00:00:00Z',
  ...partial,
})

describe('livePulseBus', () => {
  it('delivers ids to every subscriber and stops after unsubscribe', () => {
    const a = vi.fn()
    const b = vi.fn()
    const offA = subscribeEntityPulse(a)
    const offB = subscribeEntityPulse(b)
    emitEntityPulse(['x', 'y'])
    expect(a).toHaveBeenCalledWith(['x', 'y'])
    expect(b).toHaveBeenCalledWith(['x', 'y'])
    offA()
    emitEntityPulse(['z'])
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(2)
    offB()
    expect(entityPulseListenerCount()).toBe(0)
  })

  it('an empty id list is not an event', () => {
    const a = vi.fn()
    const off = subscribeEntityPulse(a)
    emitEntityPulse([])
    expect(a).not.toHaveBeenCalled()
    off()
  })
})

describe('entityIdsOfGraphEvent — the graph channel', () => {
  it('node_created / node_updated designate the node', () => {
    expect(entityIdsOfGraphEvent({ type: 'graph.node_created', node: { id: 'n1' } })).toEqual(['n1'])
    expect(entityIdsOfGraphEvent({ type: 'graph.node_updated', node_id: 'n2' })).toEqual(['n2'])
  })

  it('edge_created / edge_removed / reinforcement designate both ends', () => {
    expect(entityIdsOfGraphEvent({ type: 'graph.edge_created', edge: { source: 'a', target: 'b' } })).toEqual(['a', 'b'])
    expect(entityIdsOfGraphEvent({ type: 'graph.edge_removed', source: 'a', target: 'b' })).toEqual(['a', 'b'])
    expect(entityIdsOfGraphEvent({ type: 'graph.reinforcement', source: 'a', target: 'b' })).toEqual(['a', 'b'])
  })

  it('activation and community_changed are not pulses (owned elsewhere)', () => {
    expect(entityIdsOfGraphEvent({ type: 'graph.activation' })).toEqual([])
    expect(entityIdsOfGraphEvent({ type: 'graph.community_changed' })).toEqual([])
  })

  it('drops empty ids (a backend event without node_id)', () => {
    expect(entityIdsOfGraphEvent({ type: 'graph.node_updated', node_id: '' })).toEqual([])
    expect(entityIdsOfGraphEvent({ type: 'graph.edge_created', edge: { source: '', target: 'b' } })).toEqual(['b'])
  })
})

describe('entityIdsOfCrudEvent — the CRUD channel', () => {
  it('a task / note / chat_session event designates the entity', () => {
    expect(entityIdsOfCrudEvent(crud({ entity_type: 'task', entity_id: 't-1' }))).toEqual(['t-1'])
    expect(entityIdsOfCrudEvent(crud({ entity_type: 'note', action: 'created', entity_id: 'n-1' }))).toEqual(['n-1'])
    expect(entityIdsOfCrudEvent(crud({ entity_type: 'chat_session', entity_id: 's-1', payload: { is_streaming: true } }))).toEqual(['s-1'])
  })

  it('a linked event designates both ends', () => {
    expect(
      entityIdsOfCrudEvent(crud({ entity_type: 'commit', action: 'linked', entity_id: 'abc', related: { entity_type: 'task', entity_id: 't-9' } })),
    ).toEqual(['abc', 't-9'])
  })

  it('a deletion lights nothing', () => {
    expect(entityIdsOfCrudEvent(crud({ action: 'deleted' }))).toEqual([])
  })

  it('signals that are not graph nodes are skipped', () => {
    for (const t of ['attention_changed', 'runner', 'alert', 'learning', 'trigger', 'lifecycle_hook', 'topology_rule', 'environment', 'deployment']) {
      expect(entityIdsOfCrudEvent(crud({ entity_type: t as CrudEvent['entity_type'], entity_id: 'x' }))).toEqual([])
    }
  })

  it('tolerates a malformed message', () => {
    expect(entityIdsOfCrudEvent(null as unknown as CrudEvent)).toEqual([])
    expect(entityIdsOfCrudEvent(crud({ entity_id: '' }))).toEqual([])
  })
})
