import { useCallback, useRef } from 'react'
import { useSetAtom } from 'jotai'
import {
  planRefreshAtom,
  taskRefreshAtom,
  projectRefreshAtom,
  milestoneRefreshAtom,
  noteRefreshAtom,
  workspaceRefreshAtom,
  chatSessionRefreshAtom,
} from '@/atoms'
import { useEventBus } from './useEventBus'
import type { CrudEvent, EntityType } from '@/types'

const DEBOUNCE_MS = 500

/**
 * Top-level hook that listens to WebSocket CRUD events and bumps
 * refresh counters for each entity type. Pages include the relevant
 * counter atom in their useEffect deps to auto-refetch.
 */
export function useCrudEventRefresh() {
  const bumpPlan = useSetAtom(planRefreshAtom)
  const bumpTask = useSetAtom(taskRefreshAtom)
  const bumpProject = useSetAtom(projectRefreshAtom)
  const bumpMilestone = useSetAtom(milestoneRefreshAtom)
  const bumpNote = useSetAtom(noteRefreshAtom)
  const bumpWorkspace = useSetAtom(workspaceRefreshAtom)
  const bumpChatSession = useSetAtom(chatSessionRefreshAtom)

  const timers = useRef<Map<EntityType, ReturnType<typeof setTimeout>>>(new Map())

  const handleEvent = useCallback(
    (event: CrudEvent) => {
      const entityType = event.entity_type

      // Debounce per entity type to avoid rapid-fire refetches
      const existing = timers.current.get(entityType)
      if (existing) clearTimeout(existing)

      timers.current.set(
        entityType,
        setTimeout(() => {
          timers.current.delete(entityType)

          switch (entityType) {
            case 'plan':
            case 'decision':
            case 'constraint':
              bumpPlan((c) => c + 1)
              break
            case 'task':
            case 'step':
              bumpTask((c) => c + 1)
              break
            case 'project':
            case 'commit':
            case 'release':
              bumpProject((c) => c + 1)
              break
            case 'milestone':
              bumpMilestone((c) => c + 1)
              break
            case 'note':
              bumpNote((c) => c + 1)
              break
            case 'workspace':
              bumpWorkspace((c) => c + 1)
              // When projects are added/removed from a workspace (linked/unlinked),
              // also bump project refresh so workspace-scoped project lists update
              // (e.g. ChatPanel's ProjectSelect, overview page).
              if (event.action === 'linked' || event.action === 'unlinked') {
                bumpProject((c) => c + 1)
              }
              break
            case 'workspace_milestone':
            case 'resource':
            case 'component':
              bumpWorkspace((c) => c + 1)
              break
            case 'chat_session':
              bumpChatSession((c) => c + 1)
              break
          }
        }, DEBOUNCE_MS),
      )
    },
    [bumpPlan, bumpTask, bumpProject, bumpMilestone, bumpNote, bumpWorkspace, bumpChatSession],
  )

  useEventBus(handleEvent)
}
