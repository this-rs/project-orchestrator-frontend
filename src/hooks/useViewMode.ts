import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

type ViewMode = 'list' | 'kanban'

export function useViewMode(defaultMode: ViewMode = 'list'): [ViewMode, (mode: ViewMode) => void] {
  const [searchParams, setSearchParams] = useSearchParams()

  const viewMode = (searchParams.get('view') as ViewMode) || defaultMode

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (mode === defaultMode) {
          next.delete('view')
        } else {
          next.set('view', mode)
        }
        return next
      }, { replace: true })
    },
    [setSearchParams, defaultMode],
  )

  return [viewMode, setViewMode]
}
