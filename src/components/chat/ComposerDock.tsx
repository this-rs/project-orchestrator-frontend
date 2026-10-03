import { useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * Floats the composer (and what stacks with it: compaction banner, secret requests) over the
 * bottom of the transcript, so the messages scroll UNDER its glass instead of stopping above a
 * flat strip. It reports its own height — it changes with the queue bar, the attachments, the
 * banners — so the transcript can keep its last line clear of it (`ChatMessages.bottomInset`).
 *
 * The dock spans the full width but swallows no click in its empty margins: only its children
 * take pointer events.
 */
export function ComposerDock({ children, onHeight }: { children: ReactNode; onHeight: (px: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // Rounded UP: never under-reserve a pixel, or the last line would touch the glass.
    const report = () => onHeight(Math.ceil(el.getBoundingClientRect().height))
    report()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(report)
    observer.observe(el)
    return () => observer.disconnect()
  }, [onHeight])

  return (
    <div ref={ref} className="absolute inset-x-0 bottom-0 z-10 flex flex-col pointer-events-none [&>*]:pointer-events-auto">
      {children}
    </div>
  )
}
