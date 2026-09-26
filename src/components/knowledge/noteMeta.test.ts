import { describe, it, expect } from 'vitest'
import { anchorName, changeDetailsText, entityHref, noteBody, notePreview, noteTitle, scopeLabel } from './noteMeta'

describe('noteMeta', () => {
  it('derives the title from the first meaningful line, markdown stripped', () => {
    expect(noteTitle('# Retries **double**-charge\n\nbody')).toBe('Retries double-charge')
    expect(noteTitle('\n\n- first bullet [link](x)\nrest')).toBe('first bullet link')
    expect(noteTitle('')).toBe('(empty note)')
  })

  it('drops a leading heading that is the title from the rendered body', () => {
    expect(noteBody('# Title\n\nThe body.\n')).toBe('The body.')
    expect(noteBody('Plain first line\nsecond')).toBe('Plain first line\nsecond')
    expect(noteBody('# Only a heading')).toBe('')
    // a heading that is not the first meaningful line stays
    expect(noteBody('intro\n# Later heading')).toBe('intro\n# Later heading')
  })

  it('previews the remaining lines as plain text, skipping code fences', () => {
    expect(notePreview('# T\n```ts\nconst a = 1\n```\n- item')).toBe('const a = 1 item')
  })

  it('links entities to the pages the app has', () => {
    expect(entityHref('ws', 'task', 't1')).toBe('/workspace/ws/tasks/t1')
    expect(entityHref('ws', 'file', 'src/a b.ts')).toBe('/workspace/ws/code?file=src%2Fa%20b.ts')
    expect(entityHref('ws', 'function', 'main')).toBeNull()
    expect(anchorName({ entity_type: 'file', entity_id: 'src/api/client.ts' })).toBe('client.ts')
  })

  it('formats scope and change details', () => {
    expect(scopeLabel({ type: 'project' })).toBe('Project-wide')
    expect(scopeLabel({ type: 'file', path: 'src/x.ts' })).toBe('file src/x.ts')
    expect(scopeLabel(null)).toBeNull()
    expect(changeDetailsText({ from: 'active', to: 'stale' })).toBe('active → stale')
    expect(changeDetailsText({ reason: 'rewritten' })).toBe('rewritten')
    expect(changeDetailsText('free text')).toBe('free text')
    expect(changeDetailsText({ nested: { a: 1 } })).toBeNull()
  })
})
