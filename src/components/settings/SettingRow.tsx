/**
 * Settings / maintenance rows — local composition of the design-system
 * primitives for the settings-like pages (Admin, Sharing, Neural routing,
 * MCP federation, Settings). Candidate for promotion into `components/ui`.
 *
 * ```
 * Label                                         [control]
 * one-line plain explanation (muted)
 * meta · meta (cost, last run…)
 * ```
 */
import { useState, type ReactNode } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import { Button, ConfirmDialog, MetaLine } from '@/components/ui'
import { useConfirmDialog, useToast } from '@/hooks'

// ── Container ───────────────────────────────────────────────────────────

export function SettingsList({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <ul
      role="list"
      className={`rounded-xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.05] ${className}`}
    >
      {children}
    </ul>
  )
}

// ── Row ─────────────────────────────────────────────────────────────────

interface SettingRowProps {
  label: ReactNode
  /** One short plain-language line: what it does / what it means. */
  description?: ReactNode
  /** Right-aligned control (Switch, Select, Button, value). Wraps under the text on narrow screens when wide. */
  control?: ReactNode
  /** Extra muted meta line (cost, duration, last result…). */
  meta?: ReactNode[]
  /** Leading icon (decorative). */
  icon?: ReactNode
  /** Full-width content under the row (inputs, progress…). */
  children?: ReactNode
  className?: string
}

export function SettingRow({ label, description, control, meta, icon, children, className = '' }: SettingRowProps) {
  return (
    <li className={`px-3 py-2.5 md:px-4 ${className}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-start gap-2.5 min-w-0 flex-[1_1_14rem]">
          {icon && (
            <span className="shrink-0 mt-0.5 text-gray-500 [&_svg]:w-4 [&_svg]:h-4" aria-hidden="true">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <div className="text-sm leading-5 text-gray-200 break-words">{label}</div>
            {description && <p className="mt-0.5 text-xs leading-4 text-gray-500 break-words">{description}</p>}
            {meta && <MetaLine items={meta} className="mt-1" />}
          </div>
        </div>
        {control && <div className="flex flex-wrap items-center gap-2 ml-auto shrink-0 max-w-full">{control}</div>}
      </div>
      {children && <div className="mt-2">{children}</div>}
    </li>
  )
}

// ── Action row (maintenance operations) ─────────────────────────────────

interface ActionRowProps {
  label: string
  description: ReactNode
  /** Cost / risk in plain words, e.g. "A few seconds · safe". */
  cost?: ReactNode
  icon?: ReactNode
  buttonLabel?: string
  buttonVariant?: 'primary' | 'secondary' | 'danger'
  confirm?: { title: string; description?: string; variant?: 'danger' | 'warning' | 'info'; confirmLabel?: string }
  /** Returns the success message shown in a toast. */
  onAction: () => Promise<string>
  disabled?: boolean
  /** Extra control rendered before the button (e.g. a level Select). */
  extra?: ReactNode
}

export function ActionRow({
  label,
  description,
  cost,
  icon,
  buttonLabel = 'Run',
  buttonVariant = 'secondary',
  confirm,
  onAction,
  disabled,
  extra,
}: ActionRowProps) {
  const [loading, setLoading] = useState(false)
  const confirmDialog = useConfirmDialog()
  const toast = useToast()

  const run = async () => {
    setLoading(true)
    try {
      toast.success(await onAction())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setLoading(false)
    }
  }

  const handleClick = () => {
    if (confirm) {
      confirmDialog.open({
        title: confirm.title,
        description: confirm.description,
        variant: confirm.variant ?? 'info',
        confirmLabel: confirm.confirmLabel ?? buttonLabel,
        onConfirm: run,
      })
    } else {
      void run()
    }
  }

  return (
    <SettingRow
      label={label}
      description={description}
      meta={cost ? [cost] : undefined}
      icon={icon}
      control={
        <>
          {extra}
          <Button
            variant={buttonVariant}
            size="sm"
            onClick={handleClick}
            disabled={disabled}
            loading={loading}
            aria-label={`${buttonLabel} — ${label}`}
          >
            {buttonLabel}
          </Button>
          <ConfirmDialog {...confirmDialog.dialogProps} />
        </>
      }
    />
  )
}

// ── Notice (inline info / warning line) ─────────────────────────────────

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warning'; children: ReactNode }) {
  const Icon = tone === 'warning' ? AlertTriangle : Info
  return (
    <p
      className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-4 ${
        tone === 'warning' ? 'bg-amber-500/[0.06] text-amber-300/90' : 'bg-white/[0.03] text-gray-400'
      }`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  )
}
