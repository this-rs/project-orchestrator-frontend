import { useState, useEffect, useRef } from 'react'

/**
 * Returns the number of milliseconds elapsed since `startIso` (ISO 8601 string).
 * Updates every 100ms while under 10s (for 0.1s precision), then every 1s.
 * Returns undefined when inactive or when startIso is missing.
 */
export function useElapsedMs(startIso: string | undefined, active: boolean): number | undefined {
  const [elapsed, setElapsed] = useState<number | undefined>(() => {
    if (!active || !startIso) return undefined
    return Math.max(0, Date.now() - new Date(startIso).getTime())
  })
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!active || !startIso) {
      setElapsed(undefined)
      return
    }

    const startTime = new Date(startIso).getTime()
    const tick = () => setElapsed(Math.max(0, Date.now() - startTime))

    // Set immediately
    tick()

    // Start with 100ms interval; switch to 1s after 10s
    const scheduleInterval = (ms: number) => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = setInterval(() => {
        const now = Date.now() - startTime
        tick()
        // Switch from fast (100ms) to slow (1s) once we pass 10s
        if (ms === 100 && now >= 10_000) {
          scheduleInterval(1000)
        }
      }, ms)
    }

    const currentElapsed = Date.now() - startTime
    scheduleInterval(currentElapsed < 10_000 ? 100 : 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [startIso, active])

  return elapsed
}

/**
 * Format milliseconds to a human-readable duration string.
 * < 1s   → "420ms"
 * < 10s  → "4.2s"  (0.1s precision)
 * < 60s  → "12s"   (1s precision)
 * >= 60s → "1m04s"
 */
export function formatDurationShort(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  const mins = Math.floor(ms / 60_000)
  const secs = Math.round((ms % 60_000) / 1000)
  return `${mins}m${secs.toString().padStart(2, '0')}s`
}
