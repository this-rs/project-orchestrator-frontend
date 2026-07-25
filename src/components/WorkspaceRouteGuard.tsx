import { useLayoutEffect } from 'react'
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

  // (workspaces.length === 0 means still loading, so we treat the slug optimistically)
  const workspacesLoaded = workspaces.length > 0
  const slugIsKnown = !!slug && workspacesLoaded && workspaces.some((w) => w.slug === slug)
  const slugIsUnknown = !!slug && workspacesLoaded && !slugIsKnown

  // Sync URL slug → atom for redirect memory only (RootRedirect, LegacyRedirect, SettingsPage).
  // All workspace-scoped components use useWorkspaceSlug() / useWorkspace() from the URL directly.
  //
  // Persist ONLY once the slug is validated against the loaded workspace list,
  // and CLEAR the stored slug when it turns out to be dead. Previously the raw
  // URL slug was persisted unconditionally BEFORE validation: a stale slug
  // (deleted/renamed workspace, reset backend) kept being re-written to
  // localStorage on every visit, so every app open took the detour
  // `/` → `/workspace/<dead>` → optimistic full render (every page fetching a
  // nonexistent workspace) → `/workspace-selector?notFound=…` — forever.
  useLayoutEffect(() => {
    if (slugIsKnown) {
      setActiveSlug(slug!)
    } else if (slugIsUnknown) {
      setActiveSlug(null)
    }
  }, [slug, slugIsKnown, slugIsUnknown, setActiveSlug])

  // No slug in URL → redirect to workspace selector
  if (!slug) {
    return <Navigate to="/workspace-selector" replace />
  }

  // If workspaces are loaded and slug doesn't match any → redirect with notice
  if (slugIsUnknown) {
    return <Navigate to={`/workspace-selector?notFound=${encodeURIComponent(slug)}`} replace />
  }

  return <Outlet />
}
