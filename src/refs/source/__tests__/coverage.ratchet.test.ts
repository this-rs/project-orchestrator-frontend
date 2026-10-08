/**
 * The ratchet: every component that draws a plan, task, note, decision or rfc
 * declares it as a reference source (so it can be dragged into the chat and
 * added without dragging), or is listed WITH A REASON in coverage.exceptions.ts,
 * a list that can only shrink.
 *
 * A static scan of the sources, by design: it fails the day someone adds a row
 * for one of these entities and forgets to declare it. The scanner itself is
 * tested on synthetic components below.
 *
 * Run with: npx vitest run src/refs/source/__tests__/coverage.ratchet.test.ts
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { REF_KINDS, type RefKind } from '../../types'
import { COVERAGE_EXCEPTIONS, RATCHET_MAX } from './coverage.exceptions'

const SEGMENT: Record<RefKind, string> = { plan: 'plans', task: 'tasks', note: 'notes', decision: 'decisions', rfc: 'rfcs' }

/** Signals that a component draws an entity of `kind`: a link to its page, or its status drawn with that kind. */
function showsKind(source: string, kind: RefKind): boolean {
  // A link to the entity page (the runner dashboard of a plan is navigation, not the plan).
  const link = new RegExp(`/${SEGMENT[kind]}/\\$\\{[^}]+\\}(?!/runner)`).test(source)
  // Its status drawn with its kind, in a file that also draws rows or links (a bare status badge is not an entity).
  const status = new RegExp(`kind=["'{]+${kind}["'}]`).test(source) && /<EntityRow|<PageHeader|<Link\b|<BoardCard/.test(source)
  return link || status
}

/** A declaration leaves one of these markers (the shared rows and the hooks all do)... */
const DECLARES = /entityRef=|entityRef\b[^=\n]*[:=]|useReferenceSource\(|<ReferenceSource\b|<AddToChatButton\b|data-po-ref=/

/** ...and names the kind it declares in object-literal form. */
const declaresKind = (source: string, kind: RefKind): boolean =>
  DECLARES.test(source) &&
  (new RegExp(`kind:\\s*['"\`]${kind}['"\`]`).test(source) || new RegExp(`po-ref:[^*\\n]*\\b${kind}\\b`).test(source))

/** Kinds the file draws without declaring them. */
const undeclaredKinds = (source: string): RefKind[] =>
  REF_KINDS.filter((k) => showsKind(source, k) && !declaresKind(source, k))

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue
      walk(full, out)
    } else if (/\.tsx$/.test(name) && !/\.(test|spec|stories)\.tsx$/.test(name)) {
      out.push(full)
    }
  }
}

/** `src/path/File.tsx` -> the kinds it shows without declaring. Empty when everything is declared. */
function findOffenders(srcDir: string, root: string): Record<string, RefKind[]> {
  const files: string[] = []
  walk(srcDir, files)
  const out: Record<string, RefKind[]> = {}
  for (const f of files.sort()) {
    if (f.includes(join('src', 'refs', 'source'))) continue
    const kinds = undeclaredKinds(readFileSync(f, 'utf8'))
    if (kinds.length > 0) out[relative(root, f)] = kinds
  }
  return out
}

const root = process.cwd()
const offenders = findOffenders(join(root, 'src'), root)

describe('coverage ratchet', () => {
  it('every file that draws an entity declares it, or is a justified exception', () => {
    const unexplained = Object.entries(offenders)
      .filter(([file]) => !(file in COVERAGE_EXCEPTIONS))
      .map(([file, kinds]) => `${file} (${kinds.join(', ')})`)
    expect(
      unexplained,
      'These files draw an entity without declaring it. Add entityRef / useReferenceSource / <ReferenceSource> (see refs/source/refSource.ts), or justify an exception in coverage.exceptions.ts.',
    ).toEqual([])
  })

  it('an exception that no longer applies is removed (the list only shrinks)', () => {
    const stale = Object.keys(COVERAGE_EXCEPTIONS).filter((file) => !(file in offenders))
    expect(stale, 'Now declared (or gone): delete these exceptions and lower RATCHET_MAX.').toEqual([])
  })

  it('lists the kinds it excuses, no more', () => {
    for (const [file, { kinds }] of Object.entries(COVERAGE_EXCEPTIONS)) {
      expect([...kinds].sort(), file).toEqual([...(offenders[file] ?? [])].sort())
    }
  })

  it('has exactly RATCHET_MAX exceptions: the number goes down, never up', () => {
    expect(Object.keys(COVERAGE_EXCEPTIONS).length).toBe(RATCHET_MAX)
  })

  it('every exception is justified in a real sentence', () => {
    for (const [file, { why }] of Object.entries(COVERAGE_EXCEPTIONS)) {
      expect(why.length, file).toBeGreaterThan(30)
    }
  })
})

describe('the scanner (a guard that cannot fail guards nothing)', () => {
  const undeclaredRow = `
    export function Row({ task, wsSlug }) {
      return <EntityRow title={task.title} href={workspacePath(wsSlug, \`/tasks/\${task.id}\`)} />
    }`
  const declaredRow = undeclaredRow.replace('<EntityRow ', "<EntityRow entityRef={{ kind: 'task', id: task.id }} ")

  it('flags a row that links an entity page and declares nothing', () => {
    expect(undeclaredKinds(undeclaredRow)).toEqual(['task'])
  })

  it('accepts the same row once declared', () => {
    expect(undeclaredKinds(declaredRow)).toEqual([])
  })

  it('is per kind: declaring the plan does not excuse the task next to it', () => {
    const both = `${declaredRow}\n<EntityRow entityRef={{ kind: 'plan', id: p.id }} href={\`/plans/\${p.id}\`} />\n<Link to={\`/tasks/\${t.id}\`} />`
    expect(declaresKind(both, 'plan')).toBe(true)
    expect(undeclaredKinds(both.replace("kind: 'task'", "kind: 'x'"))).toEqual(['task'])
  })

  it('sees a status drawn with the kind of the entity in a row, but not a bare badge', () => {
    expect(showsKind('<EntityRow status={[<StatusText kind="note" status={n.status} />]} />', 'note')).toBe(true)
    expect(showsKind('export const Badge = () => <StatusText kind="rfc" status="x" />', 'rfc')).toBe(false)
  })

  it('does not take the runner dashboard of a plan for the plan', () => {
    expect(showsKind('navigate(`/plans/${planId}/runner`)', 'plan')).toBe(false)
    expect(showsKind('navigate(`/plans/${planId}`)', 'plan')).toBe(true)
  })

  it('accepts a dynamic declaration only when it names its kinds', () => {
    const dynamic = 'const s = useReferenceSource({ kind, id }); <a href={`/plans/${id}`}/>'
    expect(declaresKind(dynamic, 'plan')).toBe(false)
    expect(declaresKind(`/* po-ref: plan task */ ${dynamic}`, 'plan')).toBe(true)
  })
})
