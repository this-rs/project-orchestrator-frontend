import { useState, useCallback, useMemo, useRef, useEffect } from 'react'

const NO_IDS: ReadonlySet<string> = new Set<string>()

export function useMultiSelect<T>(items: T[], getId: (item: T) => string) {
  // A selection belongs to the `items` array it was made on. When that array changes
  // (pagination, filters, reload) the selection is empty — DERIVED at read time, not
  // cleared in an effect: an effect runs after the render that shows the new rows, so a
  // click landing in that window was wiped by the stale reset.
  const [selection, setSelection] = useState<{ items: T[] | null; ids: ReadonlySet<string> }>({
    items: null,
    ids: NO_IDS,
  })
  const selectedIds = selection.items === items ? selection.ids : NO_IDS
  const lastToggledIndexRef = useRef<number | null>(null)

  const setSelectedIds = useCallback(
    (update: (prev: ReadonlySet<string>) => Set<string>) =>
      setSelection((prev) => ({ items, ids: update(prev.items === items ? prev.ids : NO_IDS) })),
    [items],
  )

  useEffect(() => {
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
    [items, getId, setSelectedIds],
  )

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allIds = items.map(getId)
      const allSelected = allIds.length > 0 && allIds.every((id) => prev.has(id))
      return allSelected ? new Set() : new Set(allIds)
    })
    lastToggledIndexRef.current = null
  }, [items, getId, setSelectedIds])

  const clear = useCallback(() => {
    setSelectedIds(() => new Set())
    lastToggledIndexRef.current = null
  }, [setSelectedIds])

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
