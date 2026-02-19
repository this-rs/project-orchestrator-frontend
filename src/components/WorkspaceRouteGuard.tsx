import { useEffect } from 'react'
import { Outlet, useParams, Navigate } from 'react-router-dom'
import { useSetAtom, useAtomValue } from 'jotai'
import { activeWorkspaceSlugAtom, workspacesAtom } from '@/atoms'

/**
 * Route guard that:
 * 1. Extracts the :slug from the URL
 * 2. Syncs it with activeWorkspaceSlugAtom (URL is source of truth)
 * 3. Validates the slug exists in loaded workspaces
 * 4. Renders children (Outlet) if valid
 *
 * Place this as a layout route wrapping all /workspace/:slug/* routes.
 */
export function WorkspaceRouteGuard() {
  const { slug } = useParams<{ slug: string }>()
  const setActiveSlug = useSetAtom(activeWorkspaceSlugAtom)
  const workspaces = useAtomValue(workspacesAtom)

  // Sync URL slug → atom (URL is always source of truth)
  useEffect(() => {
    if (slug) {
      setActiveSlug(slug)
    }
  }, [slug, setActiveSlug])

  // No slug in URL → redirect to workspace selector
  if (!slug) {
    return <Navigate to="/workspace-selector" replace />
  }

  // If workspaces are loaded and slug doesn't match any → redirect
  // (workspaces.length === 0 means still loading, so we render optimistically)
  if (workspaces.length > 0 && !workspaces.some((w) => w.slug === slug)) {
    return <Navigate to="/workspace-selector" replace />
  }

  return <Outlet />
}
