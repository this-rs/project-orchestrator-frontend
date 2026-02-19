import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { Workspace, WorkspaceOverview } from '@/types'

/** All loaded workspaces */
export const workspacesAtom = atom<Workspace[]>([])

export const workspacesLoadingAtom = atom<boolean>(false)

/**
 * Active workspace slug — persisted in localStorage.
 * This is the single source of truth for which workspace the user is viewing.
 * The URL (/workspace/:slug) takes priority and syncs this atom.
 */
export const activeWorkspaceSlugAtom = atomWithStorage<string | null>(
  'po-active-workspace',
  null,
)

/**
 * Derived: the full Workspace object for the active slug.
 * Returns null if no workspace is selected or the slug doesn't match any loaded workspace.
 */
export const activeWorkspaceAtom = atom<Workspace | null>((get) => {
  const slug = get(activeWorkspaceSlugAtom)
  if (!slug) return null
  const workspaces = get(workspacesAtom)
  return workspaces.find((w) => w.slug === slug) ?? null
})

/** Overview data for the currently viewed workspace detail page */
export const workspaceOverviewAtom = atom<WorkspaceOverview | null>(null)
