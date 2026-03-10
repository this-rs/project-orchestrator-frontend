// ============================================================================
// useEntityGroups — Manages enabled/disabled state of entity groups
// ============================================================================
//
// Provides toggle controls for EntityGroupPanel. Persists state per scale
// level so toggling groups in a plan view doesn't affect the task view.
// ============================================================================

import { useCallback, useMemo, useState } from 'react'
import type { EntityGroup, EntityGroupConfig, GraphAdapter } from '@/types/fractal-graph'

interface UseEntityGroupsReturn {
  /** Currently enabled groups */
  enabledGroups: Set<EntityGroup>
  /** Toggle a group on/off */
  toggle: (group: EntityGroup) => void
  /** Enable a specific group */
  enable: (group: EntityGroup) => void
  /** Disable a specific group */
  disable: (group: EntityGroup) => void
  /** Enable all groups */
  enableAll: () => void
  /** Reset to defaults */
  resetToDefaults: () => void
  /** Check if a group is enabled */
  isEnabled: (group: EntityGroup) => boolean
  /** Available group configs for this adapter */
  groups: EntityGroupConfig[]
}

/**
 * Hook to manage entity group toggle state.
 *
 * @param adapter - The GraphAdapter for the current scale level
 * @returns Controls and state for entity group toggling
 */
export function useEntityGroups<T>(adapter: GraphAdapter<T>): UseEntityGroupsReturn {
  const groups = adapter.supportedGroups

  // Initialize with default enabled groups
  const defaultEnabled = useMemo(
    () => new Set(groups.filter((g) => g.defaultEnabled).map((g) => g.id)),
    [groups],
  )

  const [enabledGroups, setEnabledGroups] = useState<Set<EntityGroup>>(defaultEnabled)

  const toggle = useCallback((group: EntityGroup) => {
    setEnabledGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) {
        // Don't allow disabling 'core'
        if (group === 'core') return prev
        next.delete(group)
      } else {
        next.add(group)
      }
      return next
    })
  }, [])

  const enable = useCallback((group: EntityGroup) => {
    setEnabledGroups((prev) => {
      if (prev.has(group)) return prev
      const next = new Set(prev)
      next.add(group)
      return next
    })
  }, [])

  const disable = useCallback((group: EntityGroup) => {
    setEnabledGroups((prev) => {
      if (!prev.has(group) || group === 'core') return prev
      const next = new Set(prev)
      next.delete(group)
      return next
    })
  }, [])

  const enableAll = useCallback(() => {
    setEnabledGroups(new Set(groups.map((g) => g.id)))
  }, [groups])

  const resetToDefaults = useCallback(() => {
    setEnabledGroups(defaultEnabled)
  }, [defaultEnabled])

  const isEnabled = useCallback(
    (group: EntityGroup) => enabledGroups.has(group),
    [enabledGroups],
  )

  return {
    enabledGroups,
    toggle,
    enable,
    disable,
    enableAll,
    resetToDefaults,
    isEnabled,
    groups,
  }
}
