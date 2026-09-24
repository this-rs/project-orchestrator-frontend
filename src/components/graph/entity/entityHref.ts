/**
 * Default entity → route mapping (mirrors the routes declared in App.tsx).
 * Returns null when the entity has no detail page yet (notes, code, commits…).
 * Pages may pass their own `hrefForNode` to EntityGraph instead.
 */
const SEGMENT: Record<string, string> = {
  decision: 'decisions',
  task: 'tasks',
  plan: 'plans',
  milestone: 'milestones',
  skill: 'skills',
  persona: 'personas',
  feature_graph: 'feature-graphs',
  protocol: 'protocols',
  project: 'projects', // expects the project slug as id
  chat_session: 'chat',
}

export function entityHref(type: string, id: string, wsSlug: string): string | null {
  const seg = SEGMENT[type]
  if (!seg || !id || !wsSlug) return null
  return `/workspace/${encodeURIComponent(wsSlug)}/${seg}/${encodeURIComponent(id)}`
}
