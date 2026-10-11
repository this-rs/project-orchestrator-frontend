/**
 * The components the two views of a timeline (the span tree, the tracks) share:
 * the toolbar button, the bottom sheet of the detail on a phone.
 */
import { useEffect, useRef, type CSSProperties } from 'react'
import { focusRing } from '@/components/ui/classes'

export function ToolButton({ label, onClick, pressed, wide, children }: { label: string; onClick: () => void; pressed?: boolean; wide: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={`inline-flex shrink-0 items-center justify-center rounded-md transition-colors ${wide ? 'size-8' : 'size-11'} ${
        pressed ? 'bg-indigo-400/20 text-indigo-200' : 'text-gray-300 hover:bg-white/[0.06] hover:text-gray-100'
      } ${focusRing}`}
    >
      {children}
    </button>
  )
}

/** The detail on a phone: a sheet over the lower part of the screen; Escape or the close button dismisses it. */
export function BottomSheet({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const style: CSSProperties = { paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      data-testid="trace-sheet"
      className="fixed inset-x-0 bottom-0 z-50 max-h-[70dvh] overflow-y-auto rounded-t-2xl border-t border-white/15 bg-slate-900 px-4 pt-2 shadow-2xl outline-none"
      style={style}
    >
      <div aria-hidden="true" className="mx-auto mb-2 h-1 w-10 rounded bg-white/25" />
      {children}
    </div>
  )
}
