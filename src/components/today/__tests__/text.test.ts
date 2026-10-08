/**
 * The words of Today live in ONE registry (`../text`), in English like the rest of the UI
 * (DESIGN.md § 0 « The words of Today are concepts too »; i18n after #252). Two guards:
 * the registry itself (vocabulary of website/AUDIENCE.md § 2), and the source files of the
 * folder, which must not type a French word again outside comments.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NOMENCLATURE } from '@/constants/nomenclature'
import { BAND_TEXT, STUCK_LABEL, TODAY_TEXT } from '../bands'
import { LIVE_TEXT } from '../live/text'
import { WORK_TEXT } from '../work/text'
import { TEXT } from '../text'

const TODAY_DIR = join(__dirname, '..')

/** Every source file of the folder, tests left out (their fixtures are data, not interface). */
function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (name !== '__tests__') out.push(...sourceFiles(path))
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
      out.push(path)
    }
  }
  return out
}

/** The code without its comments: block comments (JSX ones included) and line comments. */
function withoutComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

/** Every string the registry can show, functions called with sample arguments. */
function allStrings(node: unknown, path = 'TEXT'): [string, string][] {
  if (typeof node === 'string') return [[path, node]]
  if (typeof node === 'function') {
    const f = node as (...a: unknown[]) => string
    return [1, 2].flatMap((n) => [
      [`${path}(${n})`, f(n, 'X', 'Y')],
      [`${path}('X', ${n})`, f('X', n)],
      [`${path}(true, 'X')`, f(true, 'X')],
    ])
  }
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([k, v]) => allStrings(v, `${path}.${k}`))
  }
  return []
}

/** The French accents a product string of this folder used to carry. */
const FRENCH_ACCENTS = /[àâéèêëîïôûùüç]/

/** website/AUDIENCE.md § 2: the words that never reach the reader (and the engineer's words behind them). */
const BANNED_WORDS = /\bagents?\b|\bmilestones?\b|\bRFCs?\b|\brunner\b|\bCLI\b|\bsub-agents?\b/i

describe('the words of Today: one English registry', () => {
  it('has no French left in any value of the registry', () => {
    for (const [path, s] of allStrings(TEXT)) {
      expect(s, path).not.toMatch(FRENCH_ACCENTS)
    }
  })

  it('speaks the product vocabulary: Assistants, Objectives, Plans, Proposals — never agent, milestone, RFC', () => {
    for (const [path, s] of allStrings(TEXT)) {
      expect(s, path).not.toMatch(BANNED_WORDS)
    }
    expect(TEXT.thinking.groups.rfc).toBe(NOMENCLATURE.proposals.plural)
    expect(TEXT.thinking.groups.decision).toBe(NOMENCLATURE.decisions.plural)
    expect(TEXT.live.title).toBe('Assistants')
  })

  it('names the four bands, the stuck causes and the page in English, with stable keys', () => {
    expect(Object.keys(TEXT.bands)).toEqual(['waiting', 'running', 'stuck', 'thinking'])
    expect(TEXT.bands.waiting.title).toBe('Waiting for you')
    expect(TEXT.bands.stuck.title).toBe('To resume')
    expect(TEXT.bands.running.title).toBe('In progress')
    expect(TEXT.bands.thinking.title).toBe('To read')
    expect(Object.keys(TEXT.stuckLabel).sort()).toEqual(['budget_exceeded', 'failed', 'orphan_request', 'session_error', 'task_blocked'])
    expect(TEXT.today.title).toBe('Today')
    expect(TEXT.today.allLanes).toBe('All')
    expect(TEXT.work.title).toBe('My tasks')
  })

  it('is what the historical names still point at (nothing is typed twice)', () => {
    expect(BAND_TEXT).toBe(TEXT.bands)
    expect(TODAY_TEXT).toBe(TEXT.today)
    expect(STUCK_LABEL).toBe(TEXT.stuckLabel)
    expect(LIVE_TEXT).toBe(TEXT.live)
    expect(WORK_TEXT).toBe(TEXT.work)
  })

  it('no source file of the folder types a French word outside its comments', () => {
    const files = sourceFiles(TODAY_DIR)
    expect(files.length).toBeGreaterThan(10)
    const offenders: string[] = []
    for (const file of files) {
      const code = withoutComments(readFileSync(file, 'utf8'))
      code.split('\n').forEach((line, i) => {
        if (FRENCH_ACCENTS.test(line)) offenders.push(`${relative(TODAY_DIR, file)}:${i + 1}: ${line.trim()}`)
      })
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
