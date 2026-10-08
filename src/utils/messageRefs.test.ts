/**
 * The TS twin of the backend's `<po-refs>` block and `#kind:id` token, driven by
 * the backend's own golden vectors (`refs/__fixtures__`, copied as is).
 */
import { describe, expect, it } from 'vitest'
import block from '@/refs/__fixtures__/po_refs_block.json'
import tokens from '@/refs/__fixtures__/tokens.json'
import entityRef from '@/refs/__fixtures__/entity_ref.json'
import { findRefTokens, refToken, splitRefs } from './messageRefs'
import { splitAttachments } from './messageAttachments'

describe('splitRefs — golden block vectors', () => {
  it('uses the contract markers', () => {
    expect(block.open).toBe('\n\n<po-refs>')
    expect(block.close).toBe('</po-refs>')
  })

  for (const c of block.cases) {
    it(`decodes "${c.name}"`, () => {
      const { text, refs } = splitRefs(c.encoded)
      expect(refs).toEqual(c.refs)
      // A forged block is neutralized by the server: it stays in the text, untouched.
      expect(text).toBe('decoded_text' in c ? c.decoded_text : c.text)
    })
  }

  it('decodes refs first, attachments last: attachments are peeled before refs', () => {
    const w = block.with_attachments
    const outer = splitAttachments(w.encoded)
    expect(outer.attachments).toEqual(w.attachments)
    const inner = splitRefs(outer.text)
    expect(inner).toEqual({ text: w.text, refs: w.refs })
    // Without peeling the attachments first the refs block is not final: it is not read.
    expect(splitRefs(w.encoded)).toEqual({ text: w.encoded, refs: [] })
  })

  for (const raw of block.left_in_text_when_unparsable) {
    it(`leaves an unreadable block in the text: ${JSON.stringify(raw).slice(0, 40)}`, () => {
      expect(splitRefs(raw)).toEqual({ text: raw, refs: [] })
    })
  }

  it('reads every kind of entity_ref.json, and only the final block', () => {
    for (const c of entityRef.cases) {
      const encoded = `t\n\n<po-refs>${JSON.stringify([c.ref])}</po-refs>`
      expect(splitRefs(encoded).refs).toEqual([c.ref])
    }
    const early = `x\n\n<po-refs>[{"kind":"plan","id":"57cf05c9-25b6-495d-ab07-de4b11d64736"}]</po-refs>\nmore text`
    expect(splitRefs(early).refs).toEqual([])
  })

  it('refuses a block holding a reserved kind, a bad id, the nil id, or extra text after the array', () => {
    const wrap = (j: string) => `t\n\n<po-refs>${j}</po-refs>`
    for (const j of [
      '[{"kind":"persona","id":"57cf05c9-25b6-495d-ab07-de4b11d64736"}]',
      '[{"kind":"plan","id":"nope"}]',
      '[{"kind":"plan","id":"00000000-0000-0000-0000-000000000000"}]',
      '{"kind":"plan"}',
      '[null]',
      'not json',
    ]) {
      expect(splitRefs(wrap(j))).toEqual({ text: wrap(j), refs: [] })
    }
  })

  it('drops any field but kind and id (a label in the block is never believed)', () => {
    const e = `t\n\n<po-refs>[{"kind":"plan","id":"57cf05c9-25b6-495d-ab07-de4b11d64736","label":"evil"}]</po-refs>`
    expect(splitRefs(e).refs).toEqual([{ kind: 'plan', id: '57cf05c9-25b6-495d-ab07-de4b11d64736' }])
  })
})

describe('findRefTokens — golden token vectors', () => {
  for (const v of tokens.valid) {
    it(`finds ${v.token}`, () => {
      expect(findRefTokens(v.token)).toEqual([{ ...v.ref, start: 0, end: v.token.length, raw: v.token }])
      expect(refToken(v.ref as never)).toBe(v.token)
    })
  }

  for (const v of tokens.invalid) {
    it(`finds nothing in ${v.token} (${v.reason})`, () => {
      expect(findRefTokens(v.token)).toEqual([])
    })
  }

  it('finds a token after a space, a bracket or a newline, with exact offsets, in order', () => {
    const [a, b] = tokens.valid
    const text = `voir ${a.token}, puis (${b.token})\n${a.token}`
    const found = findRefTokens(text)
    expect(found.map((t) => t.raw)).toEqual([a.token, b.token, a.token])
    for (const t of found) expect(text.slice(t.start, t.end)).toBe(t.raw)
  })

  it('does not take a # glued to a word or a URL, an escaped one, a heading, or a bare number', () => {
    const t = tokens.valid[0].token
    for (const text of [`a${t}`, `/path/${t}`, `https://x/y${t}`, `\\${t}`, `&${t}`, `# ${t.slice(1)}`, '#123', `${t}x`, `${t}-1`]) {
      expect(findRefTokens(text), text).toEqual([])
    }
  })
})
