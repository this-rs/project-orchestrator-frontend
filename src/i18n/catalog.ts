/**
 * Catalog: types derived from English (the only source language) and the list of domains.
 * A domain is one file per language (messages/<lang>/<ns>.ts); a page or feature owns its own.
 *
 * Side-effect free: also imported by Node (scripts/check-i18n.mjs), hence no `@/` alias.
 */
import type common from './messages/en/common.ts'
import type nav from './messages/en/nav.ts'

interface EnglishMessages {
  common: typeof common
  nav: typeof nav
}

export type Ns = keyof EnglishMessages
export const NAMESPACES = ['common', 'nav'] as const satisfies readonly Ns[]

/** Every other language is a (possibly partial) overlay of the same shape. */
export type Translation<N extends Ns> = DeepPartial<EnglishMessages[N]>
export type DeepPartial<T> = T extends string ? string : { [K in keyof T]?: DeepPartial<T[K]> }

type Join<P extends string, K extends string> = P extends '' ? K : `${P}.${K}`
type Leaves<T, P extends string = ''> = T extends string
  ? P
  : { [K in keyof T & string]: Leaves<T[K], Join<P, K>> }[keyof T & string]

/** `ns.path.to.string`, checked against English at compile time. */
export type MessageKey = { [N in Ns]: Leaves<EnglishMessages[N], N> }[Ns]
export type Vars = Readonly<Record<string, string | number>>
export type Messages = EnglishMessages
