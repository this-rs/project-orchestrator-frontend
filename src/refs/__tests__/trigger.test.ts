import { describe, expect, it } from 'vitest'
import { detectTrigger, MAX_QUERY_CHARS } from '../trigger'

const at = (text: string) => detectTrigger(text, text.length)

describe('detectTrigger', () => {
  it('opens on a bare # with an empty query (most recent)', () => {
    expect(at('#')).toEqual({ start: 0, end: 1, query: '', sigil: '#' })
  })

  it('reads the query after the # up to the caret, after a space or an opener', () => {
    expect(at('voir #refs')).toEqual({ start: 5, end: 10, query: 'refs', sigil: '#' })
    expect(at('voir (#refs')).toMatchObject({ start: 6, query: 'refs', sigil: '#' })
    expect(at('a\n#b')).toMatchObject({ start: 2, query: 'b' })
  })

  it('uses the caret, not the end of the text', () => {
    expect(detectTrigger('voir #refs et la suite', 10)).toEqual({ start: 5, end: 10, query: 'refs', sigil: '#' })
    expect(detectTrigger('voir #refs et la suite', 4)).toBeNull()
  })

  it('takes a kind prefix as a filter: "#rfc foo"', () => {
    expect(at('#rfc design')).toEqual({ start: 0, end: 11, query: 'design', kinds: ['rfc'], sigil: '#' })
    expect(at('x #Task ')).toMatchObject({ query: '', kinds: ['task'] })
    // not a kind: a space ends the query, there is no trigger any more
    expect(at('#foo bar')).toBeNull()
  })

  it('is not a trigger: a # glued to a word or a URL, a heading, a double #', () => {
    for (const text of ['abc#refs', 'https://x/y#refs', '# title', '## title', '##x', 'a #x y']) {
      expect(at(text), text).toBeNull()
    }
  })

  it('is not a trigger inside inline code or a fenced block', () => {
    expect(at('`code #refs')).toBeNull()
    expect(at('``` \n#refs')).toBeNull()
    expect(at('```\ncode\n```\n#refs')).toMatchObject({ query: 'refs', sigil: '#' })
    expect(at('`a` #refs')).toMatchObject({ query: 'refs', sigil: '#' })
  })

  it('is not a trigger on a finished token or a query too long to be one', () => {
    expect(at('#plan:57cf05c9-25b6-495d-ab07-de4b11d64736')).toBeNull()
    expect(at('#plan:')).toBeNull()
    expect(at('#' + 'a'.repeat(MAX_QUERY_CHARS + 1))).toBeNull()
    expect(at('#' + 'a'.repeat(MAX_QUERY_CHARS))).not.toBeNull()
  })

  it('rejects a caret outside the text', () => {
    expect(detectTrigger('#a', 5)).toBeNull()
    expect(detectTrigger('#a', -1)).toBeNull()
  })
})
