import { useParams, useNavigate } from 'react-router-dom'
import { useCallback } from 'react'
import { workspacePath } from '@/utils/paths'

/**
 * Returns the active workspace slug from the URL (/workspace/:slug/...).
 * Must be used inside a route with a :slug param (under WorkspaceRouteGuard).
 *
 * @throws Error if no :slug param is found in the URL
 */
export function useWorkspaceSlug(): string {
  const { slug } = useParams<{ slug: string }>()
  if (!slug) {
    throw new Error(
      'useWorkspaceSlug() must be used inside a route with :slug param (under WorkspaceRouteGuard)',
    )
  }
  return slug
}

/**
 * Returns a navigate function that automatically prefixes paths with /workspace/:slug.
 *
 * @example
 * const wsNavigate = useWorkspaceNavigate()
 * wsNavigate('/plans')       // navigates to /workspace/my-ws/plans
 * wsNavigate('/tasks/abc')   // navigates to /workspace/my-ws/tasks/abc
 */
export function useWorkspaceNavigate() {
  const slug = useWorkspaceSlug()
  const navigate = useNavigate()

  return useCallback(
    (path: string, options?: { replace?: boolean; state?: unknown }) => {
      navigate(workspacePath(slug, path), options)
    },
    [slug, navigate],
  )
}
