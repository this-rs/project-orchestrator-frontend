import { useContext } from 'react'
import { useInRouterContext, useParams } from 'react-router-dom'
import { ChromeWorkspaceSlugContext } from '@/hooks/useWorkspace'
import { refName } from '@/refs/refState'
import { displayState, isRefKind, type ChatReference } from '@/refs/types'
import { KnownRefsContext, citedRefPath } from './citedRef'
import { RefChip } from './RefChip'

/**
 * An entity the agent cited as `#kind:id`: kind icon, label (or the short id
 * when nobody resolved it), a link to the entity in the application.
 *
 * It only claims what the server confirmed: a link needs `cites_resolved` to
 * have read the entity (`ok` or `truncated`). Until then — streaming, a server
 * that does not announce, an id the agent made up — the token stays the text it
 * was, as it does without a workspace to build the link in.
 * Drawn `inline`: quasi-text at rest, the full chip on hover, focus or press.
 *
 * A citation the SERVER could not read — an id that names nothing, an entity
 * of another project — is the one case it must not dress up: `cites_resolved`
 * says so, and the token stays plain text. No chip, and above all no link:
 * a broken link is worse than no link.
 */
export function CitedRefChip({ kind, id, raw }: { kind: string; id: string; raw: string }) {
  const known = useContext(KnownRefsContext)
  const { slug: paramSlug } = useParams<{ slug: string }>()
  const chromeSlug = useContext(ChromeWorkspaceSlugContext)
  const inRouter = useInRouterContext()
  const slug = paramSlug ?? chromeSlug
  const ref: ChatReference | undefined = known.find(
    (r) => r.kind === kind && r.id.toLowerCase() === id.toLowerCase(),
  )
  // `forbidden` and `not_found` are one state on purpose: the server never lets
  // a client tell them apart (see `displayState`).
  const state = ref === undefined ? 'pending' : displayState(ref)
  const unreadable = state === 'unavailable'
  // A link only for an id the server read: while the turn streams, with a server
  // that does not announce, or for an id the agent made up, the token stays text.
  const confirmed = state === 'ok' || state === 'truncated'

  if (!isRefKind(kind) || !slug || !confirmed) {
    return unreadable ? (
      <span data-testid="cited-ref-unreadable" data-state="unavailable" className="whitespace-nowrap">
        {raw}
      </span>
    ) : (
      <>{raw}</>
    )
  }

  const name = refName(ref ?? { kind, id })
  return (
    <RefChip testId="cited-ref" density="inline" kind={kind} name={name} to={citedRefPath(slug, { kind, id })} inRouter={inRouter} />
  )
}
