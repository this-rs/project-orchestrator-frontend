import { useCallback, useId, useRef, useState } from 'react'
import { Check, ChevronDown, Loader2 } from 'lucide-react'
import { FloatingMenu } from './FloatingMenu'
import { menuItemClass } from './menuPosition'
import { focusRing, hitArea } from './classes'
import {
  TONE_CLASSES,
  getPriorityMeta,
  getStatusMeta,
  getStatusOptions,
  type StatusKind,
  type StatusTone,
  type StatusValue,
} from './statusMeta'

// ============================================================================
// StatusDot — 6px (or 8px) coloured dot, optional pulse for live states
// ============================================================================

interface StatusDotProps {
  /** Either a tone directly… */
  tone?: StatusTone
  /** …or a kind + status looked up in the registry. */
  kind?: StatusKind
  status?: string | null
  size?: 'sm' | 'md'
  /** Soft ping animation (running / streaming). Respects reduced motion. */
  pulse?: boolean
  /**
   * Accessible label. When omitted the dot is decorative (aria-hidden) — only
   * do that when the status is also spelled out in text nearby.
   */
  label?: string
  className?: string
}

export function StatusDot({ tone, kind, status, size = 'sm', pulse, label, className = '' }: StatusDotProps) {
  const resolved = tone ?? getStatusMeta(kind, status).tone
  const dim = size === 'md' ? 'w-2 h-2' : 'w-1.5 h-1.5'
  const color = TONE_CLASSES[resolved].dot
  const a11y = label ? { role: 'img' as const, 'aria-label': label, title: label } : { 'aria-hidden': true as const }
  return (
    <span className={`relative inline-flex shrink-0 ${dim} ${className}`} {...a11y}>
      {pulse && <span className={`absolute inset-0 rounded-full ${color} opacity-60 motion-safe:animate-ping`} />}
      <span className={`relative inline-block ${dim} rounded-full ${color}`} />
    </span>
  )
}

// ============================================================================
// StatusText — dot + label in the tone colour (the default status display)
// ============================================================================

interface StatusTextProps {
  kind?: StatusKind
  status: string | null | undefined
  /** Hide the dot (e.g. when the row already shows a leading StatusDot). */
  dot?: boolean
  pulse?: boolean
  /** Override the label (e.g. `Done`). */
  label?: string
  className?: string
}

export function StatusText({ kind, status, dot = true, pulse, label, className = '' }: StatusTextProps) {
  const meta = getStatusMeta(kind, status)
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${TONE_CLASSES[meta.tone].text} ${className}`}>
      {dot && <StatusDot tone={meta.tone} pulse={pulse} />}
      {label ?? meta.label}
    </span>
  )
}

// ============================================================================
// PriorityText — `P8` in a tone colour; renders nothing for 0 / missing
// ============================================================================

export function PriorityText({ priority, className = '' }: { priority: number | null | undefined; className?: string }) {
  const meta = getPriorityMeta(priority)
  if (!meta) return null
  return (
    <span
      className={`font-mono tabular-nums whitespace-nowrap ${TONE_CLASSES[meta.tone].text} ${className}`}
      title={meta.label}
      aria-label={meta.label}
    >
      {meta.short}
    </span>
  )
}

// ============================================================================
// StatusMenu — quiet, touch-safe status changer (replaces Interactive*Badge)
// ============================================================================

interface StatusMenuProps<K extends StatusKind> {
  kind: K
  status: StatusValue<K> | string
  onChange: (next: StatusValue<K>) => void | Promise<void>
  /** Restrict / reorder the choices (default: every status of the kind). */
  options?: StatusValue<K>[]
  disabled?: boolean
  /** Accessible name, default `Status: <label>. Change status`. */
  label?: string
  className?: string
}

/**
 * Status as text (dot + label + chevron) that opens a menu of statuses.
 * Shows a spinner while `onChange` resolves. Safe inside an EntityRow (does
 * not trigger the row). Compact visually, tap area enlarged via `hitArea`.
 */
export function StatusMenu<K extends StatusKind>({
  kind,
  status,
  onChange,
  options,
  disabled,
  label,
  className = '',
}: StatusMenuProps<K>) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = `sm-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const meta = getStatusMeta(kind, status)
  const all = getStatusOptions(kind)
  const choices = options ? all.filter((o) => options.includes(o.value)) : all

  const close = useCallback((focusTrigger: boolean) => {
    setOpen(false)
    if (focusTrigger) triggerRef.current?.focus()
  }, [])

  const select = async (value: StatusValue<K>) => {
    close(true)
    if (value === status) return
    setBusy(true)
    try {
      await onChange(value)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className={`relative z-10 inline-flex ${className}`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled || busy}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label ?? `Status: ${meta.label}. Change status`}
        className={`${hitArea} -mx-1 px-1 inline-flex items-center gap-1.5 rounded whitespace-nowrap transition-colors hover:bg-white/[0.05] ${focusRing} disabled:cursor-not-allowed ${TONE_CLASSES[meta.tone].text}`}
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : <StatusDot tone={meta.tone} />}
        <span>{meta.label}</span>
        {!disabled && <ChevronDown className={`w-3 h-3 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />}
      </button>
      <FloatingMenu open={open} onClose={close} triggerRef={triggerRef} id={menuId} label="Change status" align="start">
        {choices.map((o) => {
          const m = getStatusMeta(kind, o.value)
          const selected = o.value === status
          return (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={selected}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                void select(o.value)
              }}
              className={menuItemClass()}
            >
              <StatusDot tone={m.tone} size="md" />
              <span className="flex-1">{o.label}</span>
              {selected && <Check className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />}
            </button>
          )
        })}
      </FloatingMenu>
    </span>
  )
}
