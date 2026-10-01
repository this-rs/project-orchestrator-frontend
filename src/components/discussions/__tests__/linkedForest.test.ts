import { describe, it, expect } from 'vitest'
import type { SessionTreeNode } from '@/types/chat'
import { buildLinkedForest, countNodes, type LinkedSession } from '../linkedForest'

const row = (id: string, parent: string | null, extra: Partial<SessionTreeNode> = {}): SessionTreeNode => ({
  session_id: id,
  parent_session_id: parent,
  depth: parent ? 1 : 0,
  is_streaming: false,
  ...extra,
})
const linked = (id: string, title = id): LinkedSession => ({ id, title })

const ids = (n: { session_id: string; children: unknown[] }): string[] => [
  n.session_id,
  ...(n.children as { session_id: string; children: unknown[] }[]).flatMap(ids),
]

describe('buildLinkedForest', () => {
  it('a listed session whose parent is not listed is a ROOT (attached by hand)', () => {
    const f = buildLinkedForest([linked('manual')], new Map([['manual', [row('manual', 'somewhere-else')]]]))
    expect(f.roots.map((r) => r.session_id)).toEqual(['manual'])
    expect(f.roots[0].metadata.type).toBe('root')
  })

  it('hangs the subtree of each listed session under it and keeps every listed session', () => {
    const f = buildLinkedForest(
      [linked('a'), linked('b'), linked('c')],
      new Map([
        ['a', [row('a', null), row('a1', 'a'), row('a2', 'a1')]],
        ['b', [row('b', null)]],
        // c's tree could not be read: absent from the map
      ]),
    )
    expect(f.roots.map((r) => r.session_id)).toEqual(['a', 'b', 'c'])
    expect(ids(f.roots[0])).toEqual(['a', 'a1', 'a2'])
    expect(f.total).toBe(5)
    expect(countNodes(f.roots)).toBe(5)
  })

  it('a listed session that is also a child of another listed one appears once, under it', () => {
    const f = buildLinkedForest(
      [linked('p'), linked('kid')],
      new Map([
        ['p', [row('p', null), row('kid', 'p')]],
        ['kid', [row('kid', 'p')]],
      ]),
    )
    expect(f.roots.map((r) => r.session_id)).toEqual(['p'])
    expect(f.roots[0].children.map((c) => c.session_id)).toEqual(['kid'])
    expect(f.roots[0].children[0].metadata.linked).toBe(true)
  })

  it('never loses a session to a parent loop', () => {
    const f = buildLinkedForest(
      [linked('x'), linked('y')],
      new Map([
        ['x', [row('x', 'y')]],
        ['y', [row('y', 'x')]],
      ]),
    )
    expect(countNodes(f.roots)).toBe(2)
  })

  it('keeps run / task / parent run facts and the listed title, source and cost', () => {
    const f = buildLinkedForest(
      [{ id: 'r', title: 'Run root', source: 'runner', costUsd: 1.5, messageCount: 4 }],
      new Map([['r', [row('r', null, { run_id: 'run1', task_id: 't1' }), row('r1', 'r', { run_id: 'run1', task_id: 't2' })]]]),
    )
    const root = f.roots[0]
    expect(root.title).toBe('Run root')
    expect(root.cost_usd).toBe(1.5)
    expect(root.metadata).toMatchObject({ run_id: 'run1', task_id: 't1', source: 'runner', linked: true })
    expect(root.children[0].metadata).toMatchObject({ parent_run_id: 'run1', parent_task_id: 't1', linked: false })
    expect(root.children[0].title).toBe('Session r1')
  })

  it('a task page gives its listed sessions the task they belong to', () => {
    const f = buildLinkedForest([linked('m')], new Map([['m', [row('m', null)]]]), 'task-9')
    expect(f.roots[0].metadata.task_id).toBe('task-9')
  })

  it('an empty list gives an empty forest', () => {
    expect(buildLinkedForest([], new Map())).toEqual({ roots: [], total: 0 })
  })
})
