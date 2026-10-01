import { useParams, useNavigate } from 'react-router-dom'
import { createContext, useCallback, useContext, useMemo } from 'react'
import { useAtomValue } from 'jotai'
import { workspacesAtom } from '@/atoms'
import { workspacePath } from '@/utils/paths'
import type { Workspace } from '@/types'

/**
 * Workspace slug used for the app chrome (sidebar, chat panel) on pages that
 * live outside /workspace/:slug, like the cross-workspace /today. The URL
 * slug always wins; the page itself must not read this to scope its data.
 */
export const ChromeWorkspaceSlugContext = createContext<string | null>(null)

/**
 * Returns the active workspace slug from the URL (/workspace/:slug/...).
 * Must be used inside a route with a :slug param (under WorkspaceRouteGuard),
 * or under a ChromeWorkspaceSlugContext provider (cross-workspace pages).
 *
 * @throws Error if no :slug param is found in the URL
 */
export function useWorkspaceSlug(): string {
  const { slug: paramSlug } = useParams<{ slug: string }>()
  const chromeSlug = useContext(ChromeWorkspaceSlugContext)
  const slug = paramSlug ?? chromeSlug
  if (!slug) {
    throw new Error(
      'useWorkspaceSlug() must be used inside a route with :slug param (under WorkspaceRouteGuard)',
    )
  }
  return slug
}

/**
 * Returns the full Workspace object for the current URL slug.
 * Derives everything from the URL — no global singleton atom.
 * Must be used inside a route with a :slug param (under WorkspaceRouteGuard).
 *
 * @returns Workspace object, or null if workspaces haven't loaded yet
 */
export function useWorkspace(): Workspace | null {
  const slug = useWorkspaceSlug()
  const workspaces = useAtomValue(workspacesAtom)
  return useMemo(
    () => workspaces.find((w) => w.slug === slug) ?? null,
    [workspaces, slug],
  )
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
