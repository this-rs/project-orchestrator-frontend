import { useState, useCallback, useMemo, useRef, useEffect } from 'react'

export function useMultiSelect<T>(items: T[], getId: (item: T) => string) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const lastToggledIndexRef = useRef<number | null>(null)

  // Auto-clear when items reference changes (pagination, filters)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync selection reset on items change
    setSelectedIds(new Set())
    lastToggledIndexRef.current = null
  }, [items])

  const toggle = useCallback(
    (id: string, shiftKey?: boolean) => {
      const currentIndex = items.findIndex((item) => getId(item) === id)

      if (shiftKey && lastToggledIndexRef.current !== null && currentIndex !== -1) {
        const from = Math.min(lastToggledIndexRef.current, currentIndex)
        const to = Math.max(lastToggledIndexRef.current, currentIndex)
        const rangeIds = items.slice(from, to + 1).map(getId)
        setSelectedIds((prev) => {
          const next = new Set(prev)
          for (const rangeId of rangeIds) {
            next.add(rangeId)
          }
          return next
        })
      } else {
        setSelectedIds((prev) => {
          const next = new Set(prev)
          if (next.has(id)) {
            next.delete(id)
          } else {
            next.add(id)
          }
          return next
        })
      }

      lastToggledIndexRef.current = currentIndex !== -1 ? currentIndex : null
    },
    [items, getId],
  )

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allIds = items.map(getId)
      const allSelected = allIds.length > 0 && allIds.every((id) => prev.has(id))
      return allSelected ? new Set() : new Set(allIds)
    })
    lastToggledIndexRef.current = null
  }, [items, getId])

  const clear = useCallback(() => {
    setSelectedIds(new Set())
    lastToggledIndexRef.current = null
  }, [])

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds],
  )

  const isAllSelected = useMemo(() => {
    if (items.length === 0) return false
    return items.every((item) => selectedIds.has(getId(item)))
  }, [items, selectedIds, getId])

  const selectionCount = selectedIds.size

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(getId(item))),
    [items, selectedIds, getId],
  )

  return {
    selectedIds,
    toggle,
    toggleAll,
    clear,
    isSelected,
    isAllSelected,
    selectionCount,
    selectedItems,
  }
}
