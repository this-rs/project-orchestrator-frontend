import { describe, expect, it } from 'vitest'
import resolvedFixture from '../__fixtures__/refs_resolved_event.json'
import entityRef from '../__fixtures__/entity_ref.json'
import {
  addReference,
  applyResolved,
  fallbackName,
  parseResolvedRefs,
  reconcileRefs,
  refKey,
  refName,
  refsFromBlock,
  removeRefFromText,
  removeReference,
  resolutionAnnouncement,
} from '../refState'
import { MAX_REFS_PER_MESSAGE, REF_KINDS, displayState, type ChatReference } from '../types'
import { REF_KIND_REGISTRY } from '../registry'

const [plan, task, note] = entityRef.cases.map((c) => c.ref as ChatReference)
const tok = (r: ChatReference) => `#${r.kind}:${r.id}`

describe('registry and contract', () => {
  it('has one entry per kind of the contract, and the fixture lists the same kinds', () => {
    expect([...REF_KINDS]).toEqual(entityRef.kinds)
    for (const kind of REF_KINDS) expect(REF_KIND_REGISTRY[kind].kind).toBe(kind)
    expect(MAX_REFS_PER_MESSAGE).toBe(entityRef.max_refs_per_message)
  })
})

describe('addReference / removeReference', () => {
  it('adds in order, deduplicates by (kind, id) case-insensitively, first wins', () => {
    let refs: readonly ChatReference[] = []
    refs = addReference(refs, plan)
    refs = addReference(refs, task)
    const same = addReference(refs, { ...plan, id: plan.id.toUpperCase() })
    expect(same).toBe(refs)
    expect(refs.map(refKey)).toEqual([refKey(plan), refKey(task)])
  })

  it('a duplicate teaches the label the first entry lacked, and never replaces a known one', () => {
    const bare = addReference([], plan)
    const labeled = addReference(bare, { ...plan, label: 'Plan A' })
    expect(labeled[0].label).toBe('Plan A')
    expect(addReference(labeled, { ...plan, label: 'Other' })[0].label).toBe('Plan A')
  })

  it('refuses the reference past the cap', () => {
    const full = Array.from({ length: MAX_REFS_PER_MESSAGE }, (_, i) => ({
      kind: 'note' as const,
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    }))
    expect(addReference(full, plan)).toBe(full)
  })

  it('removes one reference, and returns the same array when it was not there', () => {
    const refs = [plan, task]
    expect(removeReference(refs, plan)).toEqual([task])
    expect(removeReference(refs, note)).toBe(refs)
  })
})

describe('reconcileRefs — the text is the source of truth', () => {
  it('returns the references of the tokens, in order, deduplicated, with known labels', () => {
    const text = `a ${tok(task)} b ${tok(plan)} c ${tok(task)}`
    const out = reconcileRefs(text, [{ ...plan, label: 'Plan A' }])
    expect(out).toEqual([task, { ...plan, label: 'Plan A' }])
  })

  it('drops a chip whose token was deleted, and keeps a token nobody labeled', () => {
    expect(reconcileRefs('no token here', [plan])).toEqual([])
    expect(reconcileRefs(tok(note), [])).toEqual([note])
  })

  it('caps the references at the contract maximum', () => {
    const text = Array.from(
      { length: MAX_REFS_PER_MESSAGE + 3 },
      (_, i) => `#note:00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    ).join(' ')
    expect(reconcileRefs(text)).toHaveLength(MAX_REFS_PER_MESSAGE)
  })
})

describe('removeRefFromText', () => {
  it('removes every token of the reference with one separating space', () => {
    expect(removeRefFromText(`a ${tok(plan)} b ${tok(task)} c ${tok(plan)}`, plan)).toBe(`a b ${tok(task)} c`)
  })
  it('leaves the text alone when the token is not there', () => {
    expect(removeRefFromText(`a ${tok(task)}`, plan)).toBe(`a ${tok(task)}`)
  })
  it('keeps surrounding text when the token is glued to punctuation', () => {
    expect(removeRefFromText(`(${tok(plan)})`, plan)).toBe('()')
  })
})

describe('refs_resolved (golden event)', () => {
  const entries = parseResolvedRefs(resolvedFixture.event.refs)

  it('parses every entry of the fixture and keeps the order', () => {
    expect(entries.map((e) => [e.kind, e.status])).toEqual([
      ['plan', 'ok'],
      ['rfc', 'truncated'],
      ['task', 'not_found'],
      ['note', 'forbidden'],
    ])
    expect(entries[0].label).toBe('Chat : références #/@')
    expect(entries[0].subtitle).toBe('12 tâches')
    expect(entries[0].entity_status).toBe('in_progress')
  })

  it('drops an entry of an unknown kind or status instead of guessing', () => {
    expect(parseResolvedRefs([{ kind: 'step', id: plan.id, status: 'ok' }, { kind: 'plan', id: plan.id, status: 'wat' }, null, 3])).toEqual([])
    expect(parseResolvedRefs('nope')).toEqual([])
  })

  it('folds into the message references: statuses set, labels kept for ok, never kept for unavailable', () => {
    const before: ChatReference[] = [
      { ...plan, label: 'optimistic label' },
      { ...task, label: 'stale label' },
      note,
    ]
    const after = applyResolved(before, entries)
    const byKind = Object.fromEntries(after.map((r) => [r.kind, r]))
    expect(byKind.plan).toMatchObject({ resolution: 'ok', label: 'Chat : références #/@' })
    expect(byKind.task.resolution).toBe('not_found')
    expect(byKind.task.label).toBeUndefined()
    expect(byKind.note.resolution).toBe('forbidden')
    // the rfc was not on the message: it is appended, not lost
    expect(byKind.rfc).toMatchObject({ resolution: 'truncated' })
    expect(after).toHaveLength(4)
  })

  it('forbidden and not_found are one display state; the client cannot tell them apart', () => {
    expect(displayState({ resolution: 'forbidden' })).toBe('unavailable')
    expect(displayState({ resolution: 'not_found' })).toBe('unavailable')
    expect(displayState({ resolution: 'truncated' })).toBe('truncated')
    expect(displayState({})).toBe('pending')
  })

  it('announces what could not be read, naming it by kind and short id, and stays silent when all is read', () => {
    const msg = resolutionAnnouncement(applyResolved(undefined, entries))
    expect(msg).toContain('2 references unavailable')
    expect(msg).toContain(fallbackName(task))
    expect(msg).toContain('1 truncated')
    expect(msg).not.toContain('forbidden')
    expect(resolutionAnnouncement(applyResolved(undefined, [entries[0]]))).toBeNull()
    expect(resolutionAnnouncement([plan])).toBeNull()
  })
})

describe('names', () => {
  it('shows the label when there is one, else "Kind shortid"', () => {
    expect(refName({ ...task, label: '  PR 1  ' })).toBe('PR 1')
    expect(refName(task)).toBe('Task 3adeffc9')
  })
  it('refsFromBlock keeps what the optimistic bubble knew', () => {
    expect(refsFromBlock([plan, task], [{ ...plan, label: 'A' }])).toEqual([{ ...plan, label: 'A' }, task])
  })
})
