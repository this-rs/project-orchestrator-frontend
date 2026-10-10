/**
 * Catalog: types derived from English (the only source language) and the list of domains.
 * A domain is one file per language (messages/<lang>/<ns>.ts); a page or feature owns its own.
 *
 * Side-effect free: also imported by Node (scripts/check-i18n.mjs), hence no `@/` alias.
 */
import type common from './messages/en/common.ts'
import type architecture from './messages/en/architecture.ts'
import type code from './messages/en/code.ts'
import type featureGraphs from './messages/en/featureGraphs.ts'
import type graph from './messages/en/graph.ts'
import type projects from './messages/en/projects.ts'
import type nav from './messages/en/nav.ts'
import type routing from './messages/en/routing.ts'
import type session from './messages/en/session.ts'

interface EnglishMessages {
  common: typeof common
  architecture: typeof architecture
  code: typeof code
  featureGraphs: typeof featureGraphs
  graph: typeof graph
  projects: typeof projects
  nav: typeof nav
  routing: typeof routing
  session: typeof session
}

export type Ns = keyof EnglishMessages
export const NAMESPACES = ['common', 'nav', 'routing', 'session', 'architecture', 'code', 'featureGraphs', 'graph', 'projects'] as const satisfies readonly Ns[]

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
