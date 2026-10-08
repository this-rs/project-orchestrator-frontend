import { describe, expect, it } from 'vitest'
import tokens from '../__fixtures__/tokens.json'
import { placeRefs } from '../placeRefs'
import type { ChatReference } from '../types'

const a = tokens.valid[0]
const b = tokens.valid[1]
const refA = a.ref as ChatReference
const refB = b.ref as ChatReference

describe('placeRefs', () => {
  it('cuts the text at the tokens the message carries', () => {
    const { segments, unplaced } = placeRefs(`voir ${a.token} puis ${b.token}.`, [refA, refB])
    expect(segments.map((s) => (s.type === 'text' ? s.text : `<${s.ref.kind}>`))).toEqual(['voir ', '<plan>', ' puis ', '<task>', '.'])
    expect(unplaced).toEqual([])
  })

  it('leaves a token with no reference as plain text (no power)', () => {
    const { segments, unplaced } = placeRefs(`voir ${a.token}`, [refB])
    expect(segments).toEqual([{ type: 'text', text: `voir ${a.token}` }])
    expect(unplaced).toEqual([refB])
  })

  it('returns the references whose token is not in the text as unplaced', () => {
    const { segments, unplaced } = placeRefs('rien', [refA])
    expect(segments).toEqual([{ type: 'text', text: 'rien' }])
    expect(unplaced).toEqual([refA])
  })
})
