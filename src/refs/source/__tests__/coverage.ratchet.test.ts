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
import { ENTITY_ROUTES } from '../../entityRoutes'
import { COVERAGE_EXCEPTIONS, RATCHET_MAX } from './coverage.exceptions'

/**
 * Entities a screen can draw, and the first segment of the path of their page, from the route table itself.
 */
const SEGMENT: Record<string, string> = Object.fromEntries(ENTITY_ROUTES.filter((r) => r.kind !== 'workspace').map((r) => [r.kind, r.path.split('/')[0]]))
const ROUTE_SEGMENT = SEGMENT
/** Kinds whose status is drawn with \`kind=\"...\"\` (StatusText). A milestone status is the workspace milestone's, which has no server kind. */
const STATUS_KINDS = ['plan', 'task', 'note', 'decision', 'rfc']
const KINDS = Object.keys(SEGMENT)

const linkRe = (kind: string) => new RegExp(`/${SEGMENT[kind]}/\\$\\{[^}]+\\}(?!/)`, 'g')

/**
 * Every place the source builds the page of a `kind`, and whether it is used
 * IMPERATIVELY (`navigate(...)`, a menu action): a declarative `to=` / `href=` ends
 * up as an `<a href>` that the host reads by route, an imperative one is invisible to it.
 */
/** Is the position inside the argument list of a navigate() / push() / replace() call? */
function insideNavigateCall(before: string): boolean {
  const open = [...before.matchAll(/\b(?:navigate|(?:history|router)\.(?:push|replace))\(/g)].pop()
  if (!open) return false
  let depth = 1
  for (const ch of before.slice((open.index ?? 0) + open[0].length)) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (depth === 0) return false
  }
  return true
}

export function linkUses(source: string, kind: string): { imperative: boolean }[] {
  return [...source.matchAll(linkRe(kind))].map((m) => ({
    imperative: insideNavigateCall(source.slice(Math.max(0, (m.index ?? 0) - 200), m.index)),
  }))
}

/** Signals that a component draws an entity of `kind`: a link to its page, or its status drawn with that kind. */
function showsKind(source: string, kind: string): boolean {
  const link = linkUses(source, kind).length > 0
  // Its status drawn with its kind, in a file that also draws rows or links (a bare status badge is not an entity).
  const status = STATUS_KINDS.includes(kind) && new RegExp(`kind=["'{]+${kind}["'}]`).test(source) && /<EntityRow|<PageHeader|<Link\b|<BoardCard/.test(source)
  return link || status
}

/** Covered by the route table: the kind has a route AND the file draws its page as a declarative link. */
function coveredByRoute(source: string, kind: string): boolean {
  if (!(kind in ROUTE_SEGMENT)) return false
  const uses = linkUses(source, kind)
  // One declarative link is the entity drawn as an <a href>; a navigate() next to it (after a create, a graph click) is not a second display.
  return uses.some((u) => !u.imperative)
}

/** A declaration leaves one of these markers (the shared rows and the hooks all do)... */
const DECLARES = /entityRef=|entityRef\b[^=\n]*[:=]|useReferenceSource\(|<ReferenceSource\b|<AddToChatButton\b|data-po-ref=/

/** ...and names the kind it declares in object-literal form. */
const declaresKind = (source: string, kind: string): boolean =>
  DECLARES.test(source) &&
  (new RegExp(`kind:\\s*['"\`]${kind}['"\`]`).test(source) || new RegExp(`po-ref:[^*\\n]*\\b${kind}\\b`).test(source))

/** Kinds the file draws without declaring them. */
const undeclaredKinds = (source: string): string[] =>
  KINDS.filter((k) => showsKind(source, k) && !declaresKind(source, k) && !coveredByRoute(source, k))

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
function findOffenders(srcDir: string, root: string): Record<string, string[]> {
  const files: string[] = []
  walk(srcDir, files)
  const out: Record<string, string[]> = {}
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
  // A row that opens the task with navigate(): the host cannot see an <a href> there.
  const undeclaredRow = `
    export function Row({ task, wsSlug }) {
      return <EntityRow title={task.title} onClick={() => navigate(workspacePath(wsSlug, \`/tasks/\${task.id}\`))} />
    }`
  const declaredRow = undeclaredRow.replace('<EntityRow ', "<EntityRow entityRef={{ kind: 'task', id: task.id }} ")
  const linkRow = `<EntityRow title="x" href={workspacePath(wsSlug, \`/tasks/\${task.id}\`)} />`

  it('flags a row that opens an entity page by navigate() and declares nothing', () => {
    expect(undeclaredKinds(undeclaredRow)).toEqual(['task'])
  })

  it('accepts the same row once declared', () => {
    expect(undeclaredKinds(declaredRow)).toEqual([])
  })

  it('accepts a declarative link to an entity page with no declaration: the host reads it by route', () => {
    expect(undeclaredKinds(linkRow)).toEqual([])
    expect(coveredByRoute(linkRow, 'task')).toBe(true)
    expect(coveredByRoute(undeclaredRow, 'task')).toBe(false)
  })

  it('sees a navigate() through nested parentheses, and not an array push that merely sits nearby', () => {
    expect(linkUses('onClick: () => navigate(wpFn(ws, `/plans/${id}`))', 'plan')).toEqual([{ imperative: true }])
    expect(linkUses('items.push({ href: wpFn(ws, `/plans/${id}`) })', 'plan')).toEqual([{ imperative: false }])
    expect(linkUses('navigate(a); <Link to={wpFn(ws, `/plans/${id}`)} />', 'plan')).toEqual([{ imperative: false }])
  })

  it('a link and a navigate() side by side in a file is covered (the link is the display)', () => {
    expect(undeclaredKinds(`${undeclaredRow}\n${linkRow}`)).toEqual([])
  })

  it('a project page (keyed by a slug) is covered the same way, through the slug resolver', () => {
    expect(undeclaredKinds('<Link to={workspacePath(ws, `/projects/${p.slug}`)} />')).toEqual([])
    expect(undeclaredKinds('navigate(workspacePath(ws, `/projects/${p.slug}`))')).toEqual(['project'])
  })

  it('is per kind: declaring the task does not excuse the persona next to it', () => {
    const both = `${declaredRow}\nnavigate(workspacePath(ws, \`/personas/\${p.id}\`))`
    expect(declaresKind(both, 'task')).toBe(true)
    expect(undeclaredKinds(both)).toEqual(['persona'])
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
    const dynamic = 'const s = useReferenceSource({ kind, id }); navigate(`/plans/${id}`)'
    expect(declaresKind(dynamic, 'plan')).toBe(false)
    expect(declaresKind(`/* po-ref: plan task */ ${dynamic}`, 'plan')).toBe(true)
  })
})
