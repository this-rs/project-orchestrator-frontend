import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * Title link for an `EntityRow` that must pass router `state` (EntityRow's
 * `href` cannot). TaskDetailPage uses `{ planId, planTitle, projectId }` from
 * the state as a fast path to resolve its parent breadcrumb.
 *
 * Same "stretched" recipe as EntityRow's own link: the whole row is the tap
 * target, inner controls (StatusMenu, ⋯, rowInteractive links) stay above it.
 * Pass the plain title as `ariaLabel` on the EntityRow for the ⋯ menu name.
 */
export function RowStateLink({ to, state, children }: { to: string; state?: unknown; children: ReactNode }) {
  return (
    <Link
      to={to}
      state={state}
      className="text-left outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-1 focus-visible:after:ring-inset focus-visible:after:ring-indigo-500/60"
    >
      {children}
    </Link>
  )
}
