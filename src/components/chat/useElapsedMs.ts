import { useState, useEffect } from 'react'

/**
 * Returns the number of milliseconds elapsed since `startIso` (ISO 8601 string).
 * Updates every second while `active` is true. Returns undefined when inactive
 * or when startIso is missing.
 */
export function useElapsedMs(startIso: string | undefined, active: boolean): number | undefined {
  const [elapsed, setElapsed] = useState<number | undefined>(() => {
    if (!active || !startIso) return undefined
    return Math.max(0, Date.now() - new Date(startIso).getTime())
  })

  useEffect(() => {
    if (!active || !startIso) {
      setElapsed(undefined)
      return
    }

    const startTime = new Date(startIso).getTime()
    // Set immediately
    setElapsed(Math.max(0, Date.now() - startTime))

    const interval = setInterval(() => {
      setElapsed(Math.max(0, Date.now() - startTime))
    }, 1000)

    return () => clearInterval(interval)
  }, [startIso, active])

  return elapsed
}

/** Format milliseconds to a human-readable duration string (e.g. "1.2s", "42ms") */
export function formatDurationShort(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60_000)
  const secs = Math.round((ms % 60_000) / 1000)
  return `${mins}m${secs.toString().padStart(2, '0')}s`
}
