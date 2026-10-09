import { useContext } from 'react'
import { Link, useInRouterContext, useParams } from 'react-router-dom'
import { ChromeWorkspaceSlugContext } from '@/hooks/useWorkspace'
import { refKindDef } from '@/refs/registry'
import { refName } from '@/refs/refState'
import { isRefKind, type ChatReference } from '@/refs/types'
import { KnownRefsContext, citedRefPath } from './citedRef'

const CHIP_CLASS =
  'inline-flex min-h-6 max-w-full items-center gap-1 rounded-md border border-indigo-400/30 bg-indigo-500/10 px-1.5 align-baseline text-xs text-slate-100 no-underline hover:bg-indigo-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 [@media(pointer:coarse)]:min-h-11'

/**
 * An entity the agent cited as `#kind:id`: kind icon, label (or the short id
 * when nobody resolved it), a link to the entity in the application.
 *
 * It only claims what it knows: the id is well-formed, nothing more. Without
 * a workspace to build the link in, the token stays the text it was.
 */
export function CitedRefChip({ kind, id, raw }: { kind: string; id: string; raw: string }) {
  const known = useContext(KnownRefsContext)
  const { slug: paramSlug } = useParams<{ slug: string }>()
  const chromeSlug = useContext(ChromeWorkspaceSlugContext)
  const inRouter = useInRouterContext()
  const slug = paramSlug ?? chromeSlug
  if (!isRefKind(kind) || !slug) return <>{raw}</>

  const ref: ChatReference = known.find((r) => r.kind === kind && r.id.toLowerCase() === id.toLowerCase()) ?? { kind, id }
  const def = refKindDef(kind)
  const name = refName(ref)
  const to = citedRefPath(slug, { kind, id })
  const content = (
    <>
      <def.Icon className="h-3 w-3 shrink-0" aria-hidden />
      <span className="sr-only">{def.name}: </span>
      <span className="truncate max-w-[14rem]">{name}</span>
    </>
  )
  const props = { 'data-testid': 'cited-ref', 'data-kind': kind, className: CHIP_CLASS, title: name }
  return inRouter ? (
    <Link to={to} {...props}>
      {content}
    </Link>
  ) : (
    <a href={to} {...props}>
      {content}
    </a>
  )
}
