/**
 * Loading of message domains. English is bundled (always available, first paint never waits);
 * other languages are separate lazy chunks, merged on top of English key by key.
 */
import { DEFAULT_LOCALE, type LocaleCode } from './locales'
import { deepMerge } from './merge'
import { NAMESPACES, type Messages, type Ns } from './catalog'

const english = import.meta.glob<unknown>('./messages/en/*.ts', { import: 'default', eager: true })
const lazy = import.meta.glob<unknown>('./messages/*/*.ts', { import: 'default' })

export type Bundle = Readonly<Record<string, unknown>>

const bundles = new Map<LocaleCode, Bundle>()

function englishOf(ns: Ns): unknown {
  return english[`./messages/${DEFAULT_LOCALE}/${ns}.ts`] ?? {}
}

bundles.set(DEFAULT_LOCALE, Object.fromEntries(NAMESPACES.map((ns) => [ns, englishOf(ns)])))

export function bundleOf(locale: LocaleCode): Bundle | undefined {
  return bundles.get(locale)
}

/** Loads every domain of a language, merged over English. A missing file simply falls back to English. */
export async function loadLocale(locale: LocaleCode): Promise<Bundle> {
  const hit = bundles.get(locale)
  if (hit) return hit
  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => {
      const load = lazy[`./messages/${locale}/${ns}.ts`]
      const over = load ? await load() : undefined
      return [ns, deepMerge(englishOf(ns), over)] as const
    }),
  )
  const bundle = Object.fromEntries(entries)
  bundles.set(locale, bundle)
  return bundle
}

export function domain<N extends Ns>(bundle: Bundle, ns: N): Messages[N] {
  return bundle[ns] as Messages[N]
}
