/**
 * `@` is the second sigil: it designates actors (persona, skill, whatever the
 * server lists as one), `#` everything else. Same rules for both.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fixture from '../__fixtures__/kinds_response.json'
import { clearRefKinds, parseKindsResponse, setActiveKinds } from '../kinds'
import { detectTrigger, isReferenceQuery } from '../trigger'
import { findRefTokens, refToken, splitRefs } from '@/utils/messageRefs'
import { refKey } from '../refState'

const PERSONA = '57cf05c9-25b6-495d-ab07-de4b11d64736'
const PLAN = '3adeffc9-c8b0-4e2f-a674-55bfcb293433'
const PID = '00333b5f-2d0a-4467-9c98-155e55d2b7e5'
const SHA = 'fbb4a32c1d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a'
const at = (text: string) => detectTrigger(text, text.length)

beforeEach(() => setActiveKinds(parseKindsResponse(fixture.response)!))
afterEach(() => clearRefKinds())

describe('detectTrigger with @', () => {
  it('opens on a bare @ with the sigil in the trigger', () => {
    expect(at('@')).toEqual({ start: 0, end: 1, query: '', sigil: '@' })
    expect(at('hello @per')).toEqual({ start: 6, end: 10, query: 'per', sigil: '@' })
    expect(at('(@x')).toMatchObject({ start: 1, sigil: '@' })
  })

  it('# keeps its sigil, so the two cannot be mixed up', () => {
    expect(at('#x')).toMatchObject({ sigil: '#' })
  })

  it('same rules as #: not glued to a word, not an email, not a URL', () => {
    for (const text of ['abc@refs', 'me@example.com', 'https://x/y@refs', '@@x', 'a @x y', '\\@x']) {
      expect(at(text), text).toBeNull()
    }
  })

  it('same rules as #: nothing inside inline code or a fenced block', () => {
    expect(at('`@per')).toBeNull()
    expect(at('```\n@per')).toBeNull()
    expect(at('```\ncode\n```\n@per')).toMatchObject({ sigil: '@', query: 'per' })
  })

  it('a finished token is not a search', () => {
    expect(at(`@persona:${PERSONA}`)).toBeNull()
    expect(at('@persona:')).toBeNull()
  })

  it('a kind prefix filters to that actor: "@skill foo"', () => {
    expect(at('@skill review')).toEqual({ start: 0, end: 13, query: 'review', kinds: ['skill'], sigil: '@' })
  })

  it('an @ prefix naming a non-actor kind is not a kind filter (@plan x is not a search)', () => {
    expect(at('@plan x')).toBeNull()
  })

  it('# accepts every active kind as a prefix, including the new ones', () => {
    expect(at('#milestone v2')).toMatchObject({ kinds: ['milestone'], query: 'v2', sigil: '#' })
  })

  it('# does not accept a kind the server does not list', () => {
    clearRefKinds()
    expect(at('#milestone v2')).toBeNull()
  })

  it('a number after @ is still a query (only # numbers are issue numbers)', () => {
    expect(isReferenceQuery(at('closes #42')!)).toBe(false)
    expect(isReferenceQuery(at('@42')!)).toBe(true)
  })
})

describe('tokens', () => {
  it('@kind:uuid is a token for an actor kind', () => {
    const [t] = findRefTokens(`voir @persona:${PERSONA}`)
    expect(t).toMatchObject({ kind: 'persona', id: PERSONA, start: 5, raw: `@persona:${PERSONA}` })
  })

  it('# stays valid for every active non-actor kind', () => {
    expect(findRefTokens(`#milestone:${PLAN}`)).toHaveLength(1)
  })

  it('the wrong sigil is refused: #persona and @plan are plain text', () => {
    expect(findRefTokens(`#persona:${PERSONA}`)).toEqual([])
    expect(findRefTokens(`#skill:${PERSONA}`)).toEqual([])
    expect(findRefTokens(`@plan:${PLAN}`)).toEqual([])
    expect(findRefTokens(`@milestone:${PLAN}`)).toEqual([])
  })

  it('an email-shaped or word-glued @token is plain text', () => {
    expect(findRefTokens(`a@persona:${PERSONA}`)).toEqual([])
    expect(findRefTokens(`\`@persona:${PERSONA}\``)).toEqual([])
    expect(findRefTokens(`[x](@persona:${PERSONA})`)).toEqual([])
  })

  it('a kind the server does not list is not a token', () => {
    clearRefKinds()
    expect(findRefTokens(`@persona:${PERSONA}`)).toEqual([])
    expect(findRefTokens(`#milestone:${PLAN}`)).toEqual([])
    expect(findRefTokens(`#plan:${PLAN}`)).toHaveLength(1)
  })

  it('an id glued to a letter, a digit or a dash is not a token', () => {
    expect(findRefTokens(`@persona:${PERSONA}x`)).toEqual([])
    expect(findRefTokens(`@persona:${PERSONA}-1`)).toEqual([])
    expect(findRefTokens(`@persona:${PERSONA}.`)).toHaveLength(1)
  })

  it('a commit token carries its project: <project>:<sha>, cut at the first colon only', () => {
    const [t] = findRefTokens(`#commit:${PID}:${SHA} ok`)
    expect(t).toMatchObject({ kind: 'commit', id: `${PID}:${SHA}`, end: `#commit:${PID}:${SHA}`.length })
    expect(findRefTokens(`#commit:${PID}:abc`)).toEqual([])
  })

  it('a file and a link token run to the next space, minus trailing punctuation', () => {
    expect(findRefTokens(`#file:${PID}:src/a.rs, then`)[0]).toMatchObject({ kind: 'file', id: `${PID}:src/a.rs` })
    expect(findRefTokens('see #link:https://example.com/docs?page=2.')[0]).toMatchObject({ kind: 'link', id: 'https://example.com/docs?page=2' })
    expect(findRefTokens('#link:javascript:alert(1)')).toEqual([])
  })

  it('refToken writes @ for an actor and # for the rest', () => {
    expect(refToken({ kind: 'persona', id: PERSONA })).toBe(`@persona:${PERSONA}`)
    expect(refToken({ kind: 'skill', id: PERSONA })).toBe(`@skill:${PERSONA}`)
    expect(refToken({ kind: 'plan', id: PLAN })).toBe(`#plan:${PLAN}`)
  })

  it('an id is compared lower-cased when it is hex, as written when it is a path or an address', () => {
    expect(refKey({ kind: 'persona', id: PERSONA.toUpperCase() })).toBe(`persona:${PERSONA}`)
    expect(refKey({ kind: 'commit', id: `${PID}:${SHA.toUpperCase()}` })).toBe(`commit:${PID}:${SHA}`)
    expect(refKey({ kind: 'file', id: `${PID}:Src/A.rs` })).not.toBe(refKey({ kind: 'file', id: `${PID}:src/a.rs` }))
    expect(refKey({ kind: 'link', id: 'https://e.com/A' })).not.toBe(refKey({ kind: 'link', id: 'https://e.com/a' }))
  })

  it('the wire block decodes the new kinds, and still refuses a malformed one', () => {
    const block = (refs: unknown) => `hi\n\n<po-refs>${JSON.stringify(refs)}</po-refs>`
    expect(splitRefs(block([{ kind: 'persona', id: PERSONA }])).refs).toEqual([{ kind: 'persona', id: PERSONA }])
    expect(splitRefs(block([{ kind: 'commit', id: `${PID}:${SHA}` }])).refs).toHaveLength(1)
    expect(splitRefs(block([{ kind: 'persona', id: 'nope' }])).refs).toEqual([])
    expect(splitRefs(block([{ kind: 'step', id: PERSONA }])).refs).toEqual([])
  })

  it('a history replayed before the kinds are known still decodes (the server wrote it, not the user)', () => {
    clearRefKinds()
    const text = `hi\n\n<po-refs>${JSON.stringify([{ kind: 'persona', id: PERSONA }])}</po-refs>`
    expect(splitRefs(text).refs).toEqual([{ kind: 'persona', id: PERSONA }])
  })
})
