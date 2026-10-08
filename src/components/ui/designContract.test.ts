import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, it, expect } from 'vitest'
import allowList from './designContract.allow.json'

/**
 * Design-contract gate (DESIGN.md « Don'ts », §4, §9, § Mouvement). Reads every
 * source file of `src/pages` and `src/components` (except `ui/` itself, which IS
 * the contract) and fails when one carries a pattern the contract bans. The
 * patterns are string heuristics on the file text — on purpose: they run in
 * well under a second, need no browser, and a class string is where the drift
 * happens.
 *
 * Exceptions live in `designContract.allow.json` — one entry per file and rule,
 * with the count still tolerated, a reason and a date. The list was measured on
 * the branch that introduced the gate (the foundation alone: pages not yet
 * migrated); every page pass is expected to shrink it. A count that goes DOWN
 * passes (progress); a count that goes UP, or a new file, fails. An entry whose
 * file no longer exists fails too: delete it.
 *
 * How to add an exception: `docs/DESIGN_QA.md` « Liste blanche ».
 */

const SRC = join(__dirname, '..', '..')
const ROOTS = ['pages', 'components']
const SKIP_DIRS = new Set(['ui', '__tests__', '__fixtures__', 'node_modules'])
const EXT = /\.(tsx?|css)$/
const IS_TEST = /\.(test|spec)\.tsx?$/

export type RuleId =
  | 'btn-glow'
  | 'transition-all'
  | 'cubic-bezier'
  | 'ease-in-out'
  | 'uppercase-tracking-wider'
  | 'filled-pill'
  | 'button-colour-override'

interface Rule {
  id: RuleId
  /** What the contract says, for the failure message. */
  why: string
  /** Returns the offending snippets found in a file's source. */
  find: (src: string) => string[]
}

const COLOURS = 'indigo|red|green|amber|blue|emerald|violet|cyan|orange'
/** A dot (StatusDot-like), a hairline, a bar fill or a decorative blur is not a pill. */
const NOT_A_PILL = /\b(?:w|h|size)-(?:0\.5|1|1\.5|2|2\.5|3|3\.5)\b|\bh-full\b|\bblur-/

const all = (src: string, re: RegExp): string[] => Array.from(src.matchAll(re), (m) => m[0])

/** The class strings of a file: every quoted / template string that holds Tailwind-looking tokens. */
function classStrings(src: string): string[] {
  return all(src, /(["'`])(?:(?!\1)[^\\]|\\.)*\1/g).filter((s) => /\brounded-|\bbg-|\btracking-|\buppercase\b/.test(s))
}

/** Text of each `<Button …>` opening tag (braces balanced, so an arrow function in a prop does not end it). */
function buttonTags(src: string): string[] {
  const out: string[] = []
  const re = /<Button\b/g
  for (const m of src.matchAll(re)) {
    let depth = 0
    let i = m.index + m[0].length
    for (; i < src.length && i - m.index < 1200; i++) {
      const c = src[i]
      if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0) break
    }
    out.push(src.slice(m.index, i + 1))
  }
  return out
}

export const RULES: Rule[] = [
  {
    id: 'btn-glow',
    why: '`.btn-glow-*` is retired: Button carries the glass recipe (§ Matière).',
    find: (src) => all(src, /btn-glow[\w-]*/g),
  },
  {
    id: 'transition-all',
    why: '`transition-all` is banned: name what moves (§ Mouvement).',
    find: (src) => all(src, /\btransition-all\b/g),
  },
  {
    id: 'cubic-bezier',
    why: 'One curve: `var(--ease-standard)` / `ease-(--ease-standard)`, never a hand-written cubic-bezier (§ Mouvement).',
    find: (src) => all(src, /cubic-bezier\([^)]*\)/g),
  },
  {
    id: 'ease-in-out',
    why: 'A native `ease-in-out` is a second curve: use `var(--ease-standard)` (§ Mouvement).',
    find: (src) => all(src, /(?<![A-Za-z-])ease-in-out(?![A-Za-z-])/g),
  },
  {
    id: 'uppercase-tracking-wider',
    why: 'No `uppercase tracking-wider` labels (§2 Typography).',
    find: (src) =>
      classStrings(src).filter((s) => /\buppercase\b/.test(s) && /\btracking-wider\b/.test(s)),
  },
  {
    id: 'filled-pill',
    why: 'A status is a dot + text in the tone colour, never a filled pill (§4).',
    find: (src) =>
      classStrings(src).filter(
        (s) =>
          /\brounded-full\b/.test(s) &&
          (new RegExp(`\\bbg-(?:${COLOURS})-\\d00(?:/[\\d.\\[\\]]+)?(?![\\w-])`).test(s) || /\bbg-\w+-900\/50\b/.test(s)) &&
          !NOT_A_PILL.test(s),
      ),
  },
  {
    id: 'button-colour-override',
    why: 'A <Button> is never recoloured: its variant is its colour (§9, § Matière).',
    find: (src) => buttonTags(src).filter((tag) => /\bbg-(?:indigo|red)-600\b/.test(tag)),
  },
]

export interface Violation {
  file: string
  rule: RuleId
  snippets: string[]
}

export function scan(root = SRC): Violation[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) {
        if (!SKIP_DIRS.has(name)) walk(p)
      } else if (EXT.test(name) && !IS_TEST.test(name)) files.push(p)
    }
  }
  for (const r of ROOTS) walk(join(root, r))
  const out: Violation[] = []
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    for (const rule of RULES) {
      const snippets = rule.find(src)
      if (snippets.length) out.push({ file: 'src/' + relative(root, f).split(sep).join('/'), rule: rule.id, snippets })
    }
  }
  return out
}

interface AllowEntry {
  path: string
  rule: RuleId
  count: number
  reason: string
  date: string
}

const RULE_IDS = new Set<string>(RULES.map((r) => r.id))
const entries = allowList as AllowEntry[]
const allowKey = (path: string, rule: string) => `${path}::${rule}`
const allowed = new Map(entries.map((e) => [allowKey(e.path, e.rule), e]))

describe('design contract — banned patterns outside ui/', () => {
  const violations = scan()

  // Re-measure: DESIGN_CONTRACT_DUMP=<file> writes every current violation as an
  // allow-list entry (reason left to fill), to rebuild the list after a big move.
  if (process.env.DESIGN_CONTRACT_DUMP) {
    const today = new Date().toISOString().slice(0, 10)
    const dump = violations.map((v) => ({ path: v.file, rule: v.rule, count: v.snippets.length, reason: allowed.get(allowKey(v.file, v.rule))?.reason ?? 'TODO', date: today, snippets: v.snippets.map((s) => s.replace(/\s+/g, ' ').slice(0, 120)) }))
    writeFileSync(process.env.DESIGN_CONTRACT_DUMP, JSON.stringify(dump, null, 2) + '\n')
  }

  it('keeps every allow-list entry well-formed, dated, and pointing at a file that still exists', () => {
    const seen = new Set<string>()
    for (const e of entries) {
      expect(RULE_IDS.has(e.rule), `${e.path}: unknown rule "${e.rule}"`).toBe(true)
      expect(e.reason?.trim().length ?? 0, `${e.path} (${e.rule}): a reason is required`).toBeGreaterThan(8)
      expect(e.date, `${e.path} (${e.rule}): date must be YYYY-MM-DD`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(e.count, `${e.path} (${e.rule}): count must be a positive integer`).toBeGreaterThan(0)
      expect(existsSync(join(SRC, '..', e.path)), `${e.path} no longer exists: delete its allow-list entry`).toBe(true)
      const k = allowKey(e.path, e.rule)
      expect(seen.has(k), `duplicate allow-list entry ${k}`).toBe(false)
      seen.add(k)
    }
  })

  it('finds nothing the allow-list does not name (new file, new rule, or more occurrences than tolerated)', () => {
    const failures: string[] = []
    for (const v of violations) {
      const e = allowed.get(allowKey(v.file, v.rule))
      if (e && v.snippets.length <= e.count) continue
      const rule = RULES.find((r) => r.id === v.rule)!
      const head = e ? `${v.file}: ${v.snippets.length} × ${v.rule} (allow-list tolerates ${e.count})` : `${v.file}: ${v.snippets.length} × ${v.rule}`
      failures.push(`${head}\n    ${rule.why}\n    ${v.snippets.slice(0, 3).map((s) => s.replace(/\s+/g, ' ').slice(0, 110)).join('\n    ')}`)
    }
    expect(failures, `\n${failures.join('\n')}\n\nFix the file, or add a dated entry with a reason to src/components/ui/designContract.allow.json (docs/DESIGN_QA.md).`).toEqual([])
  })

  it('reports allow-list entries that are no longer needed (they can be deleted)', () => {
    const live = new Set(violations.map((v) => allowKey(v.file, v.rule)))
    const stale = entries.filter((e) => !live.has(allowKey(e.path, e.rule)))
    if (stale.length) {
      // Progress, not a failure: a page pass removed the pattern. Prune the list when touching it.
      console.info(`designContract: ${stale.length} stale allow-list entr${stale.length > 1 ? 'ies' : 'y'} — ${stale.map((e) => `${e.path} (${e.rule})`).join(', ')}`)
    }
    expect(stale.length).toBeGreaterThanOrEqual(0)
  })
})

describe('design contract — the rules themselves', () => {
  const find = (id: RuleId, src: string) => RULES.find((r) => r.id === id)!.find(src)

  it('catches the retired glow, transition-all and hand-written curves', () => {
    expect(find('btn-glow', '<button className="btn btn-glow-primary">')).toEqual(['btn-glow-primary'])
    expect(find('transition-all', 'className="transition-all duration-200"')).toHaveLength(1)
    expect(find('transition-all', 'className="transition-[all]"')).toHaveLength(0)
    expect(find('cubic-bezier', 'style={{ transition: "opacity 200ms cubic-bezier(.2,0,0,1)" }}')).toHaveLength(1)
    expect(find('ease-in-out', 'className="animate-[bounce_1s_ease-in-out_infinite]"')).toHaveLength(1)
    expect(find('ease-in-out', "animation: 'pulse 2s ease-in-out infinite'")).toHaveLength(1)
    expect(find('ease-in-out', 'className="ease-(--ease-standard)"')).toHaveLength(0)
  })

  it('catches `uppercase tracking-wider` on one element only', () => {
    expect(find('uppercase-tracking-wider', 'className="text-[10px] uppercase tracking-wider text-gray-500"')).toHaveLength(1)
    expect(find('uppercase-tracking-wider', 'className="uppercase" title="tracking-wider"')).toHaveLength(0)
  })

  it('catches a filled pill but not a status dot, a bar fill or a decorative blur', () => {
    expect(find('filled-pill', 'className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs"')).toHaveLength(1)
    expect(find('filled-pill', 'className="flex h-12 w-12 items-center justify-center rounded-full bg-red-900/50"')).toHaveLength(1)
    expect(find('filled-pill', 'className="rounded-full bg-emerald-500/20 h-6 w-6"')).toHaveLength(1)
    expect(find('filled-pill', 'className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"')).toHaveLength(0)
    expect(find('filled-pill', 'className="h-full rounded-full bg-indigo-500"')).toHaveLength(0)
    expect(find('filled-pill', 'className="h-64 w-64 rounded-full bg-indigo-500/[0.07] blur-3xl"')).toHaveLength(0)
    expect(find('filled-pill', 'className="rounded-full border border-white/[0.08] px-1.5 text-[11px] text-gray-400"')).toHaveLength(0)
  })

  it('catches a recoloured <Button> even when a prop holds an arrow function', () => {
    const src = `<Button size="sm" onClick={() => go(a > b)} className="bg-indigo-600 hover:bg-indigo-500">Go</Button>`
    expect(find('button-colour-override', src)).toHaveLength(1)
    expect(find('button-colour-override', '<Button variant="danger">Delete</Button>')).toHaveLength(0)
    expect(find('button-colour-override', '<div className="bg-indigo-600"><Button>Go</Button></div>')).toHaveLength(0)
  })
})
