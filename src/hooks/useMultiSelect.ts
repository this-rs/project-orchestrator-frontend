import { useState, useCallback, useMemo, useRef, useEffect } from 'react'

export function useMultiSelect<T>(items: T[], getId: (item: T) => string) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const prevItemsRef = useRef(items)

  // Auto-clear when items reference changes (pagination, filters)
  useEffect(() => {
    if (prevItemsRef.current !== items) {
      setSelectedIds(new Set())
      prevItemsRef.current = items
    }
  }, [items])

  const toggle = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }
        return next
      })
    },
    [],
  )

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allIds = items.map(getId)
      const allSelected = allIds.length > 0 && allIds.every((id) => prev.has(id))
      return allSelected ? new Set() : new Set(allIds)
    })
  }, [items, getId])

  const clear = useCallback(() => {
    setSelectedIds(new Set())
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
