import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { Workspace, WorkspaceOverview } from '@/types'

/** All loaded workspaces */
export const workspacesAtom = atom<Workspace[]>([])

export const workspacesLoadingAtom = atom<boolean>(false)

/**
 * Last-visited workspace slug — persisted in localStorage.
 * Used ONLY for redirect memory (RootRedirect, LegacyRedirect, SettingsPage back button).
 * NOT the source of truth — workspace-scoped components use useWorkspaceSlug() / useWorkspace()
 * which derive the slug from the URL (/workspace/:slug).
 */
export const activeWorkspaceSlugAtom = atomWithStorage<string | null>(
  'po-active-workspace',
  null,
)

/**
 * @deprecated Use useWorkspace() hook instead — derives workspace from URL.
 * Kept only for edge cases outside workspace routes (e.g. workspace selector page).
 */
export const activeWorkspaceAtom = atom<Workspace | null>((get) => {
  const slug = get(activeWorkspaceSlugAtom)
  if (!slug) return null
  const workspaces = get(workspacesAtom)
  return workspaces.find((w) => w.slug === slug) ?? null
})

/** Overview data for the currently viewed workspace detail page */
export const workspaceOverviewAtom = atom<WorkspaceOverview | null>(null)
