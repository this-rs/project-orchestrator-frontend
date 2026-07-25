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
  undefined,
  // Read localStorage SYNCHRONOUSLY on first render. Without this, the first
  // read returns the initial value (null) and only hydrates after mount —
  // RootRedirect then races its <Navigate> against the hydration: it can
  // bounce to /workspace-selector (or the wrong workspace via the selector's
  // single-workspace auto-redirect) even though a valid last-visited slug was
  // stored. Symptom: "last selected workspace" memory erratically ignored.
  { getOnInit: true },
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
