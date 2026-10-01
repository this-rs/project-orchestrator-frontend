import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAtomValue, useSetAtom } from 'jotai'
import { activeWorkspaceSlugAtom, workspacesAtom } from '@/atoms'
import { ChromeWorkspaceSlugContext } from '@/hooks'
import { MainLayout } from '@/layouts'
import { workspacesApi } from '@/services/workspaces'

/**
 * Layout for pages that span every workspace (/today). They have no :slug, yet
 * the sidebar and chat panel need one: lend them the last-visited workspace
 * (validated against the loaded list, else the first one). Pages read the URL,
 * never this slug, to scope their data.
 */
export function GlobalRouteLayout() {
  const stored = useAtomValue(activeWorkspaceSlugAtom)
  const workspaces = useAtomValue(workspacesAtom)
  const setWorkspaces = useSetAtom(workspacesAtom)
  const loaded = workspaces.length > 0
  const [fetchedEmpty, setFetchedEmpty] = useState(false)

  useEffect(() => {
    if (loaded) return
    const controller = new AbortController()
    workspacesApi
      .list({ limit: 100, sort_by: 'name', sort_order: 'asc' }, controller.signal)
      .then((data) => {
        setWorkspaces(data.items || [])
        setFetchedEmpty((data.items || []).length === 0)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [loaded, setWorkspaces])

  const chromeSlug = loaded
    ? (workspaces.find((w) => w.slug === stored)?.slug ?? workspaces[0].slug)
    : stored

  // Not loaded yet and nothing remembered: wait for the list rather than
  // mounting the chrome on an empty slug.
  if (!chromeSlug) return loaded || fetchedEmpty ? <Navigate to="/workspace-selector" replace /> : null

  return (
    <ChromeWorkspaceSlugContext.Provider value={chromeSlug}>
      <MainLayout />
    </ChromeWorkspaceSlugContext.Provider>
  )
}
