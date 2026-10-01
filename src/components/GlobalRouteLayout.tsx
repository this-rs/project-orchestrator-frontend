import { useAtomValue } from 'jotai'
import { activeWorkspaceSlugAtom, workspacesAtom } from '@/atoms'
import { ChromeWorkspaceSlugContext } from '@/hooks'
import { MainLayout } from '@/layouts'

/**
 * Layout of the application-level pages (/today). MainLayout renders them in its
 * GLOBAL chrome: Today as the root, the workspaces listed below, nothing that
 * belongs to one workspace. The sidebar and the breadcrumb never use a workspace
 * here.
 *
 * The only thing still lent is a slug for the chat panel, which cannot exist
 * without a workspace (last visited, validated against the loaded list, else the
 * first one). With no workspace at all (first launch) it is null: no chat, and
 * Today shows its empty state with the way to create one. Pages read the URL,
 * never this slug, to scope their data.
 */
export function GlobalRouteLayout() {
  const stored = useAtomValue(activeWorkspaceSlugAtom)
  const workspaces = useAtomValue(workspacesAtom)
  const chatSlug =
    workspaces.length > 0 ? (workspaces.find((w) => w.slug === stored)?.slug ?? workspaces[0].slug) : stored

  return (
    <ChromeWorkspaceSlugContext.Provider value={chatSlug}>
      <MainLayout />
    </ChromeWorkspaceSlugContext.Provider>
  )
}
