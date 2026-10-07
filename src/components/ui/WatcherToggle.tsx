import { useState, useEffect, useCallback } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { adminApi } from '@/services/admin'
import type { WatchStatus } from '@/types'
import { isProjectWatched } from '@/utils/watch'

interface WatcherToggleProps {
  /** Project UUID */
  projectId: string
  /** Project root_path (needed for start_watch) */
  rootPath: string
  /** Optional className */
  className?: string
  /** Compact mode: icon-only button (default: false) */
  compact?: boolean
  /** Called after toggle succeeds */
  onToggle?: (watching: boolean) => void
}

/**
 * Toggle button to start/stop the file watcher for a specific project.
 *
 * Fetches the current watch status on mount and displays a toggle
 * that calls startWatch / stopWatch per project.
 */
export function WatcherToggle({
  projectId,
  rootPath,
  className = '',
  compact = false,
  onToggle,
}: WatcherToggleProps) {
  const [watching, setWatching] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  const checkStatus = useCallback(async () => {
    try {
      const status: WatchStatus = await adminApi.getWatchStatus()
      setWatching(isProjectWatched(status, projectId, rootPath))
    } catch {
      // If we can't check status, assume not watching
      setWatching(false)
    } finally {
      setLoading(false)
    }
  }, [projectId, rootPath])

  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  const handleToggle = async () => {
    setToggling(true)
    try {
      if (watching) {
        await adminApi.stopWatch(projectId)
        setWatching(false)
        onToggle?.(false)
      } else {
        await adminApi.startWatch({ path: rootPath, project_id: projectId })
        setWatching(true)
        onToggle?.(true)
      }
    } catch {
      // Recheck actual status on error
      await checkStatus()
    } finally {
      setToggling(false)
    }
  }

  if (loading) {
    return (
      <div className={`inline-flex items-center gap-1.5 ${className}`}>
        <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-500" />
        {!compact && <span className="text-xs text-gray-500">Checking watcher...</span>}
      </div>
    )
  }

  const isDisabled = toggling

  if (compact) {
    return (
      <button
        onClick={handleToggle}
        disabled={isDisabled}
        className={`p-1.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          watching
            ? 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10'
            : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.08]'
        } ${className}`}
        title={watching ? 'File watcher active — click to stop' : 'File watcher inactive — click to start'}
      >
        {toggling ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : watching ? (
          <Eye className="w-4 h-4" />
        ) : (
          <EyeOff className="w-4 h-4" />
        )}
      </button>
    )
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isDisabled}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ring-1 ring-inset transition-[color,background-color,box-shadow] disabled:opacity-50 disabled:cursor-not-allowed ${
        watching
          ? 'bg-emerald-900/40 text-emerald-400 ring-emerald-500/20 hover:bg-emerald-900/60'
          : 'bg-white/[0.04] text-gray-400 ring-white/[0.08] hover:bg-white/[0.08] hover:text-gray-200'
      } ${className}`}
      title={watching ? 'File watcher active — click to stop' : 'File watcher inactive — click to start'}
    >
      {toggling ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : watching ? (
        <Eye className="w-3.5 h-3.5" />
      ) : (
        <EyeOff className="w-3.5 h-3.5" />
      )}
      {watching ? 'Watching' : 'Watch off'}
    </button>
  )
}
