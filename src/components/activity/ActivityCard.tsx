/**
 * The chrome every run card shares: a tinted tile, a title that navigates to the
 * detailed view, a status line, and room for the type's own anatomy.
 *
 * The type-specific parts live in `PlanRunCard` / `ProtocolRunCard` /
 * `ChatSessionCard`; this component exists so the four of them cannot drift on
 * spacing, accessible name, link behaviour or the "something just happened"
 * pulse.
 */
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { focusRing, surface } from '@/components/ui/classes'

export interface ActivityCardProps {
  /** DOM id, so a log line can scroll this card into view. */
  cardId: string
  icon: LucideIcon
  tint: string
  /** Small overline naming the type ("Plan run", "Protocol run", …). */
  kind: string
  title: string
  /** Where the detailed view of this run lives. */
  href?: string
  /** Status chip, rendered under the title line. */
  status?: ReactNode
  /** Right side of the title line: elapsed time, cost. */
  trailing?: ReactNode
  /** Sequence number of the last event this card received — a change replays the pulse. */
  pulseSeq?: number
  /** Whether the pulse animation is wanted at all (user preference). */
  pulseEnabled?: boolean
  children?: ReactNode
  className?: string
}

export function ActivityCard({
  cardId,
  icon: Icon,
  tint,
  kind,
  title,
  href,
  status,
  trailing,
  pulseSeq = 0,
  pulseEnabled = true,
  children,
  className = '',
}: ActivityCardProps) {
  const style = { '--entity-tint': tint } as CSSProperties
  const body = (
    <>
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--entity-tint)_16%,transparent)] text-[var(--entity-tint)]"
          aria-hidden="true"
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] text-gray-500">{kind}</p>
          <p className="truncate text-sm font-semibold text-gray-100" title={title}>
            {title}
          </p>
        </div>
        {trailing && <div className="shrink-0 text-right text-[11px] tabular-nums text-gray-400">{trailing}</div>}
      </div>
      {status && <div className="mt-2 flex flex-wrap items-center gap-2">{status}</div>}
      {children}
    </>
  )

  return (
    <article
      id={cardId}
      style={style}
      className={`relative overflow-hidden p-3.5 ${surface} ${className}`}
    >
      {/*
        The pulse is a decoration that answers "did anything move?". It is keyed
        by the event sequence so React remounts it, which restarts a CSS
        animation without a timer in JS.
      */}
      {pulseEnabled && pulseSeq > 0 && (
        <span
          key={pulseSeq}
          className="activity-pulse-ring pointer-events-none absolute inset-0 rounded-xl"
          aria-hidden="true"
        />
      )}
      {href ? (
        <Link
          to={href}
          className={`block rounded-lg ${focusRing} before:absolute before:inset-0 before:content-['']`}
        >
          {body}
        </Link>
      ) : (
        body
      )}
    </article>
  )
}
