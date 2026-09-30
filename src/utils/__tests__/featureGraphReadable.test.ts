import { describe, it, expect } from 'vitest'
import type { FeatureGraphEntity } from '@/types'
import {
  buildEntityView,
  buildNeighbourIndex,
  cleanDocstring,
  derivedSummary,
  entityCodeName,
  entityFile,
  entityImportance,
  entityTitle,
  firstSentence,
  groupEntityViews,
  humanize,
  humanizeIfCode,
  looksLikeIdentifier,
  parseSignature,
  roleWord,
  typeLabel,
} from '../featureGraphReadable'
import { roleLabel } from '../featureGraphModel'

describe('humanize', () => {
  it('splits snake_case, camelCase and acronyms', () => {
    expect(humanize('build_system_prompt')).toBe('Build system prompt')
    expect(humanize('ChatManager')).toBe('Chat manager')
    expect(humanize('HTTPServer')).toBe('HTTP server')
    expect(humanize('parseJSONBody')).toBe('Parse JSON body')
    expect(humanize('src/chat/manager.rs::ChatManager::send_message')).toBe('Send message')
    expect(humanize('Class.method')).toBe('Method')
    expect(humanize('')).toBe('')
    expect(humanize('___')).toBe('___')
  })
  it('strips extensions for files on request', () => {
    expect(humanize('src/chat/manager.rs', { stripExtension: true })).toBe('Manager')
  })
  it('only rewrites names that look like code', () => {
    expect(looksLikeIdentifier('Chat streaming')).toBe(false)
    expect(looksLikeIdentifier('handle_ws')).toBe(true)
    expect(looksLikeIdentifier('ChatEvent')).toBe(true)
    expect(looksLikeIdentifier(undefined)).toBe(false)
    expect(humanizeIfCode('Chat streaming')).toBe('Chat streaming')
    expect(humanizeIfCode('handle_ws')).toBe('Handle ws')
    expect(humanizeIfCode(undefined)).toBe('')
  })
})

describe('docstrings', () => {
  it('takes the first sentence and strips comment markers', () => {
    expect(firstSentence('/// Builds the system prompt. Also caches it.\n/// More.')).toBe('Builds the system prompt.')
    expect(firstSentence('/**\n * Sends a message\n * to the session. Then more.\n */')).toBe('Sends a message to the session.')
    expect(firstSentence('"""Does a thing"""')).toBe('Does a thing')
    expect(firstSentence('# Title line\n\nsecond paragraph.')).toBe('Title line')
  })
  it('handles empty input and truncates very long sentences', () => {
    expect(firstSentence(undefined)).toBeUndefined()
    expect(firstSentence('///\n///')).toBeUndefined()
    expect(firstSentence('x'.repeat(400), 50)!.length).toBe(50)
    expect(cleanDocstring(null)).toBe('')
  })
})

const fn = (over: Partial<FeatureGraphEntity> = {}): FeatureGraphEntity => ({
  entity_type: 'function',
  entity_id: 'src/chat/manager.rs::build_system_prompt',
  name: 'build_system_prompt',
  role: 'entry_point',
  ...over,
})

describe('entity helpers', () => {
  it('derives the file from the entity (old shape) or uses file_path (enriched)', () => {
    expect(entityFile(fn())).toBe('src/chat/manager.rs')
    expect(entityFile({ entity_type: 'file', entity_id: 'src/ws.rs' })).toBe('src/ws.rs')
    expect(entityFile({ entity_type: 'struct', entity_id: 'ChatEvent' })).toBeUndefined()
    expect(entityFile({ entity_type: 'struct', entity_id: 'Foo::bar' })).toBeUndefined()
    expect(entityFile(fn({ file_path: 'other/x.rs' }))).toBe('other/x.rs')
  })
  it('names things', () => {
    expect(entityCodeName({ entity_type: 'function', entity_id: 'a/b.rs::go' })).toBe('go')
    expect(entityCodeName({ entity_type: 'file', entity_id: 'a/b.rs' })).toBe('a/b.rs')
    expect(entityCodeName(fn())).toBe('build_system_prompt')
    expect(entityTitle({ entity_type: 'file', entity_id: 'src/chat/manager.rs' })).toBe('Manager')
    expect(entityTitle(fn())).toBe('Build system prompt')
  })
  it('parses signatures', () => {
    expect(parseSignature('pub async fn run(&self, session: &Session, opts: Vec<(A, B)>) -> Result<String, Error>')).toEqual({
      async: true,
      params: ['session', 'opts'],
      returns: 'Result<String, Error>',
    })
    expect(parseSignature('fn go()')).toEqual({ async: false, params: [], returns: undefined })
    expect(parseSignature('function f(a, b): void')?.returns).toBeUndefined()
    expect(parseSignature('no parens')).toBeUndefined()
    expect(parseSignature('fn broken(a')).toBeUndefined()
    expect(parseSignature(undefined)).toBeUndefined()
  })
  it('writes a plain sentence without any enrichment (old shape)', () => {
    expect(derivedSummary(fn())).toBe('Function in src/chat/manager.rs · entry point of the feature')
    expect(derivedSummary({ entity_type: 'file', entity_id: 'src/ws.rs', role: 'core_logic' })).toBe(
      'Source file in src/ · does the core work of the feature',
    )
    expect(derivedSummary({ entity_type: 'file', entity_id: 'ws.rs' })).toBe('Source file')
    expect(derivedSummary({ entity_type: 'weird', entity_id: 'x', role: 'nope' })).toBe('Code entity')
  })
  it('uses the signature when present', () => {
    expect(derivedSummary(fn({ signature: 'async fn build_system_prompt(session: &Session) -> String' }))).toBe(
      'Async function in src/chat/manager.rs — takes session, returns String · entry point of the feature',
    )
    expect(derivedSummary(fn({ signature: 'fn a(x: i32, y: i32, z: i32)', role: undefined }))).toBe(
      'Function in src/chat/manager.rs — takes x, y and z',
    )
    expect(derivedSummary(fn({ signature: 'fn a()', role: undefined }))).toContain('takes no input')
  })
  it('reads importance on a 0-1 or 0-100 scale, or falls back to the role', () => {
    expect(entityImportance({ ...fn(), importance_score: 0.9 }).label).toBe('Key')
    expect(entityImportance({ ...fn(), importance_score: 0.4 }).label).toBe('Supporting')
    expect(entityImportance({ ...fn(), importance_score: 0.1 }).label).toBe('Minor')
    expect(entityImportance({ ...fn(), importance_score: 80 }).value).toBeCloseTo(0.8)
    expect(entityImportance({ ...fn(), importance_score: 500 }).value).toBe(1)
    expect(entityImportance(fn()).level).toBe('key')
    expect(entityImportance({ entity_type: 'function', entity_id: 'x', role: 'support' }).level).toBe('minor')
    expect(entityImportance({ entity_type: 'function', entity_id: 'x' }).level).toBe('minor')
  })
  it('labels', () => {
    expect(roleWord('support')).toBe('Helper')
    expect(roleWord(undefined)).toBe('Other')
    expect(typeLabel('function')).toBe('Function')
    expect(typeLabel('macro')).toBe('Macro')
    expect(typeLabel('')).toBe('Other')
  })
})

describe('buildEntityView', () => {
  it('prefers the docstring sentence and indexes it for search', () => {
    const v = buildEntityView(fn({ docstring: '/// Assembles the prompt. Long tail.', file_path: 'src/chat/manager.rs' }), 3)
    expect(v.summary).toBe('Assembles the prompt.')
    expect(v.fromDocstring).toBe(true)
    expect(v.index).toBe(3)
    expect(v.haystack).toContain('assembles')
  })
  it('degrades to a derived sentence on the old shape', () => {
    const v = buildEntityView(fn(), 0)
    expect(v.fromDocstring).toBe(false)
    expect(v.summary).toMatch(/^Function in src\/chat\/manager\.rs/)
    expect(v.title).toBe('Build system prompt')
  })
})

describe('groupEntityViews', () => {
  const views = [
    buildEntityView({ entity_type: 'function', entity_id: 'b/x.rs::f', role: 'support', line_start: 40 }, 0),
    buildEntityView({ entity_type: 'function', entity_id: 'a/y.rs::g', role: 'entry_point', line_start: 5 }, 1),
    buildEntityView({ entity_type: 'function', entity_id: 'a/y.rs::h', role: 'entry_point', line_start: 2 }, 2),
    buildEntityView({ entity_type: 'struct', entity_id: 'Loose', role: 'mystery' }, 3),
  ]
  it('groups by role in a fixed order, unknown last', () => {
    const g = groupEntityViews(views, 'role', roleLabel)
    expect(g.map((x) => x.label)).toEqual(['Entry Points', 'Support', 'Other'])
  })
  it('groups by file with breadcrumb, ordered by line, unknown file last', () => {
    const g = groupEntityViews(views, 'file', roleLabel)
    expect(g.map((x) => x.label)).toEqual(['a/y.rs', 'b/x.rs', 'No file information'])
    expect(g[0].path).toEqual(['a', 'y.rs'])
    expect(g[0].views.map((v) => v.index)).toEqual([2, 1])
  })
  it('groups by type', () => {
    const g = groupEntityViews(views, 'type', roleLabel)
    expect(g.map((x) => x.label)).toEqual(['Functions', 'Structs'])
  })
})

describe('buildNeighbourIndex', () => {
  it('indexes callers/callees, deduped, ignoring self loops', () => {
    const r = (s: string, t: string) => ({ source_type: 'Function', source_id: s, target_type: 'Function', target_id: t, relation_type: 'CALLS' })
    const idx = buildNeighbourIndex([r('a', 'b'), r('a', 'b'), r('c', 'a'), r('a', 'a')])
    expect(idx.get('a')!.outgoing).toEqual([{ entityId: 'b', relationType: 'CALLS' }])
    expect(idx.get('a')!.incoming).toEqual([{ entityId: 'c', relationType: 'CALLS' }])
    expect(idx.get('b')!.incoming).toHaveLength(1)
  })
})
