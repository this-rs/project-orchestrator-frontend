/**
 * Consistency of the translations against English (the source). Pure and Node-friendly (no `@/` alias, no
 * Vite): used by scripts/check-i18n.mjs and by the unit test, so `npm test` already fails on a broken catalog.
 *
 * Structure errors (always blocking): key absent from English, empty string, `{name}` marker added or lost.
 * Gaps (blocking only with --strict): missing key (falls back to English), text identical to English.
 */
import { flatten, placeholdersOf } from './merge.ts'

export interface Issue {
  readonly locale: string
  readonly ns: string
  readonly key: string
  readonly kind: 'extra' | 'empty' | 'placeholders' | 'missing' | 'identical'
  readonly detail?: string
}

export const STRUCTURE_KINDS: readonly Issue['kind'][] = ['extra', 'empty', 'placeholders']

export function checkDomain(locale: string, ns: string, english: unknown, translation: unknown, identicalOk: ReadonlySet<string> = new Set()): Issue[] {
  const en = flatten(english)
  const tr = flatten(translation)
  const issues: Issue[] = []
  for (const key of Object.keys(tr)) {
    if (!(key in en)) issues.push({ locale, ns, key, kind: 'extra' })
  }
  for (const [key, source] of Object.entries(en)) {
    const value = tr[key]
    if (value === undefined) {
      issues.push({ locale, ns, key, kind: 'missing' })
      continue
    }
    if (value.trim() === '') {
      issues.push({ locale, ns, key, kind: 'empty' })
      continue
    }
    const a = placeholdersOf(source).join(',')
    const b = placeholdersOf(value).join(',')
    if (a !== b) issues.push({ locale, ns, key, kind: 'placeholders', detail: `expected [${a}], found [${b}]` })
    // Proper nouns, code and symbols are legitimately identical; they are listed in identical-ok.json (`ns.key` for every language, `lang:ns.key` for one cognate).
    if (value === source && /\p{L}/u.test(source) && !identicalOk.has(`${ns}.${key}`) && !identicalOk.has(`${locale}:${ns}.${key}`)) issues.push({ locale, ns, key, kind: 'identical' })
  }
  return issues
}
