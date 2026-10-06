import { useId, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui'

interface ConfirmPanelProps {
  title: string
  children?: ReactNode
  confirmLabel: string
  /** Label of the button that closes the panel without acting. */
  cancelLabel?: string
  tone?: 'danger' | 'info'
  onConfirm: () => Promise<void> | void
  onCancel: () => void
}

/**
 * An inline confirmation (no portal, no animation): the settings page needs to
 * NAME things in it (an origin, a list of changed models), which the generic
 * `ConfirmDialog` — a single description string — cannot hold.
 */
export function ConfirmPanel({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Annuler',
  tone = 'info',
  onConfirm,
  onCancel,
}: ConfirmPanelProps) {
  const titleId = useId()
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div
      role="alertdialog"
      aria-labelledby={titleId}
      className={`mt-3 space-y-3 rounded-lg border p-3 text-sm ${
        tone === 'danger'
          ? 'border-red-500/30 bg-red-500/[0.06] text-red-100'
          : 'border-amber-500/30 bg-amber-500/[0.06] text-amber-100'
      }`}
    >
      <p id={titleId} className="font-medium">
        {title}
      </p>
      {children && <div className="text-xs leading-5 opacity-90">{children}</div>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          size="sm"
          variant={tone === 'danger' ? 'danger' : 'primary'}
          onClick={run}
          loading={busy}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  )
}

/** Shared control classes of the settings forms. */
export const FIELD =
  'w-full min-w-0 rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-sm text-gray-100 placeholder:text-gray-600 aria-disabled:opacity-60'
export const LABEL = 'block text-xs font-medium text-gray-400 mb-1'
