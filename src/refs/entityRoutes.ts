/**
 * THE table route -> kind: which application routes ARE an entity.
 *
 * App.tsx builds its <Route path> from `ENTITY_PATH`, and `routeToRef` reads the
 * same table, so a link to `/workspace/:slug/plans/<uuid>` is recognized as the
 * plan wherever it is drawn: the delegated dragstart of ReferenceSourceHost
 * turns any such `<a href>` into a reference with no code in the screen that
 * draws it. A new entity page is one line here (and a `Route` that uses it).
 *
 * Only routes whose last segment IS the entity's id belong here. A route keyed
 * by a slug (`projects/:projectSlug`, `/workspace/:slug`) cannot name an id:
 * those screens declare the entity themselves (`data-po-ref`).
 * `coverage.ratchet.test.ts` fails when App.tsx gains a `:...Id` route that is
 * neither here nor in `NON_ENTITY_ID_ROUTES`.
 */
import { kindInfo } from './kinds'
import { validateRefId } from './ids'
import type { EntityRef } from './types'

/** Route key -> path relative to `/workspace/:slug/`. Keys are for App.tsx; kinds are below. */
export const ENTITY_PATH = {
  plan: 'plans/:planId',
  task: 'tasks/:taskId',
  note: 'notes/:noteId',
  decision: 'decisions/:decisionId',
  rfc: 'rfcs/:rfcId',
  projectMilestone: 'project-milestones/:milestoneId',
  protocol: 'protocols/:protocolId',
  persona: 'personas/:id',
  skill: 'skills/:id',
  conversation: 'chat/:sessionId',
} as const

export type EntityRouteKey = keyof typeof ENTITY_PATH

/** The kind a route key designates (`project-milestones` are the server's `milestone`). */
const KIND_OF: Record<EntityRouteKey, string> = {
  plan: 'plan',
  task: 'task',
  note: 'note',
  decision: 'decision',
  rfc: 'rfc',
  projectMilestone: 'milestone',
  protocol: 'protocol',
  persona: 'persona',
  skill: 'skill',
  conversation: 'conversation',
}

export const ENTITY_ROUTES: readonly { kind: string; path: string; segments: readonly string[] }[] = (
  Object.keys(ENTITY_PATH) as EntityRouteKey[]
).map((key) => ({ kind: KIND_OF[key], path: ENTITY_PATH[key], segments: ENTITY_PATH[key].split('/') }))

/** Routes with an `:...Id` parameter that are deliberately NOT a chat reference, with the reason. */
export const NON_ENTITY_ID_ROUTES: Record<string, string> = {
  'milestones/:milestoneId': 'A workspace milestone: the server has no such kind (its `milestone` is the project milestone).',
  'feature-graphs/:id': 'A feature graph: no server kind.',
  'plans/:planId/runner': 'The runner dashboard of a plan: a view, not the plan.',
}

/**
 * The reference an in-app path designates, or null. `base` resolves relative
 * hrefs; only same-origin links count. The kind must be one THIS server
 * resolves, and the last segment must be spelled as that kind spells its id.
 */
export function routeToRef(href: string | null | undefined, base: string = window.location.href): EntityRef | null {
  if (!href) return null
  let url: URL
  try {
    url = new URL(href, base)
  } catch {
    return null
  }
  if (url.origin !== new URL(base).origin) return null
  const parts = url.pathname.split('/').filter(Boolean).map((p) => decodeURIComponent(p))
  // /workspace/:slug/<entity route>
  if (parts[0] !== 'workspace' || parts.length < 3) return null
  const rest = parts.slice(2)
  for (const route of ENTITY_ROUTES) {
    if (route.segments.length !== rest.length) continue
    let id: string | null = null
    const fits = route.segments.every((seg, i) => {
      if (seg.startsWith(':')) {
        id = rest[i]
        return true
      }
      return seg === rest[i]
    })
    if (!fits || id === null) continue
    const info = kindInfo(route.kind)
    if (!info || !validateRefId(info.idFormat, id)) return null
    return { kind: route.kind, id }
  }
  return null
}
