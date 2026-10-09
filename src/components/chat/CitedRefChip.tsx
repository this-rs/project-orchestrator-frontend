import { useContext } from 'react'
import { useInRouterContext, useParams } from 'react-router-dom'
import { ChromeWorkspaceSlugContext } from '@/hooks/useWorkspace'
import { refName } from '@/refs/refState'
import { isRefKind, type ChatReference } from '@/refs/types'
import { KnownRefsContext, citedRefPath } from './citedRef'
import { RefChip } from './RefChip'

/**
 * An entity the agent cited as `#kind:id`: kind icon, label (or the short id
 * when nobody resolved it), a link to the entity in the application.
 *
 * It only claims what it knows: the id is well-formed, nothing more. Without
 * a workspace to build the link in, the token stays the text it was.
 * Drawn `inline`: quasi-text at rest, the full chip on hover, focus or press.
 */
export function CitedRefChip({ kind, id, raw }: { kind: string; id: string; raw: string }) {
  const known = useContext(KnownRefsContext)
  const { slug: paramSlug } = useParams<{ slug: string }>()
  const chromeSlug = useContext(ChromeWorkspaceSlugContext)
  const inRouter = useInRouterContext()
  const slug = paramSlug ?? chromeSlug
  if (!isRefKind(kind) || !slug) return <>{raw}</>

  const ref: ChatReference = known.find((r) => r.kind === kind && r.id.toLowerCase() === id.toLowerCase()) ?? { kind, id }
  const name = refName(ref)
  return (
    <RefChip testId="cited-ref" density="inline" kind={kind} name={name} to={citedRefPath(slug, { kind, id })} inRouter={inRouter} />
  )
}
