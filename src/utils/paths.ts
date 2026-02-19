/**
 * Build a workspace-scoped path.
 *
 * @example workspacePath('my-ws', '/plans') → '/workspace/my-ws/plans'
 * @example workspacePath('my-ws', '/plans/abc') → '/workspace/my-ws/plans/abc'
 */
export function workspacePath(slug: string, path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `/workspace/${slug}${normalized}`
}
