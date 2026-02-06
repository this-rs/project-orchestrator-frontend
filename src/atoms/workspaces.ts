import { atom } from 'jotai'
import type { Workspace, WorkspaceOverview } from '@/types'

export const workspacesAtom = atom<Workspace[]>([])

export const workspacesLoadingAtom = atom<boolean>(false)

export const selectedWorkspaceSlugAtom = atom<string | null>(null)

export const selectedWorkspaceAtom = atom<Workspace | null>((get) => {
  const slug = get(selectedWorkspaceSlugAtom)
  const workspaces = get(workspacesAtom)
  return workspaces.find((w) => w.slug === slug) ?? null
})

export const workspaceOverviewAtom = atom<WorkspaceOverview | null>(null)
