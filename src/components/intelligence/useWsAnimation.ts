import { useEffect, useRef, type RefObject } from 'react'

/**
 * Hook that detects WebSocket animation hints in node/edge data
 * and applies/removes CSS animation classes on the container element.
 *
 * Data fields used:
 *   _wsAnimation: string  — animation type ('fly-in' | 'flash' | 'community')
 *   _wsAnimKey: number    — unique key to re-trigger on subsequent updates
 *
 * CSS classes applied: `ws-anim-fly-in`, `ws-anim-flash`, `ws-anim-community`
 * These are defined as @keyframes in IntelligenceGraphPage.tsx.
 */
export function useWsAnimation(
  data: Record<string, unknown> | undefined,
  duration = 600,
): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null)
  const prevKeyRef = useRef<string | number | null>(null)

  useEffect(() => {
    const el = ref.current
    const anim = (data as Record<string, unknown> | undefined)?._wsAnimation as string | undefined
    const animKey = (data as Record<string, unknown> | undefined)?._wsAnimKey as number | undefined
    if (!el || !anim) return

    // Prevent re-triggering the same animation (only trigger on key change)
    const key = animKey ?? anim
    if (key === prevKeyRef.current) return
    prevKeyRef.current = key

    const cls = `ws-anim-${anim}`

    // Remove first to allow re-trigger if same class
    el.classList.remove(cls)
    // Force reflow to restart animation
    void el.offsetWidth
    el.classList.add(cls)

    const timer = setTimeout(() => {
      el.classList.remove(cls)
    }, duration)

    return () => {
      clearTimeout(timer)
      el.classList.remove(cls)
    }
  }, [
    data,
    duration,
    (data as Record<string, unknown> | undefined)?._wsAnimation,
    (data as Record<string, unknown> | undefined)?._wsAnimKey,
  ])

  return ref
}
