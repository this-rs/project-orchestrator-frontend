/** Pure translator for one language and one bundle: no React, usable in tests and outside components. */
import { LOCALE_META, type LocaleCode } from './locales'
import { interpolate } from './merge'
import type { MessageKey, Vars } from './catalog'
import type { Bundle } from './store'

export interface Translator {
  readonly locale: LocaleCode
  readonly dir: 'ltr' | 'rtl'
  /** Text of a key, `{name}` replaced. A key missing at runtime renders the key itself (never throws in the UI). */
  t: (key: MessageKey, vars?: Vars) => string
  number: (value: number, options?: Intl.NumberFormatOptions) => string
  /** ISO date, in the viewer's time zone. */
  date: (iso: string | number | Date, options?: Intl.DateTimeFormatOptions) => string
}

function lookup(bundle: Bundle, key: string): unknown {
  const [ns, ...rest] = key.split('.')
  let node: unknown = bundle[ns as string]
  for (const part of rest) {
    if (node === null || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return node
}

export function createTranslator(locale: LocaleCode, bundle: Bundle): Translator {
  const meta = LOCALE_META[locale]
  const numberFmt = new Intl.NumberFormat(meta.intl)
  const fmt = (n: number) => numberFmt.format(n)
  return {
    locale,
    dir: meta.dir,
    t: (key, vars) => {
      const v = lookup(bundle, key)
      return typeof v === 'string' ? interpolate(v, vars, fmt) : key
    },
    number: (value, options) => (options ? new Intl.NumberFormat(meta.intl, options).format(value) : fmt(value)),
    date: (value, options) => {
      const d = value instanceof Date ? value : new Date(value)
      if (Number.isNaN(d.getTime())) return String(value)
      return new Intl.DateTimeFormat(meta.intl, { day: 'numeric', month: 'short', year: 'numeric', ...options }).format(d)
    },
  }
}
