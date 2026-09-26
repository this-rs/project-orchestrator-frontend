/**
 * ScheduledActionsPanel — protocols that start on their own (trigger_mode
 * auto / scheduled / event / webhook), with their trigger configuration,
 * last trigger time, latest run and a "Run now" button.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Calendar, Loader2, Play, Radio, Webhook, Zap, type LucideIcon } from 'lucide-react'
import { protocolApi } from '@/services/protocolApi'
import { useToast } from '@/hooks'
import {
  Button,
  EmptyState,
  EntityList,
  EntityRow,
  RelativeTime,
  StatusText,
  humanizeStatus,
} from '@/components/ui'
import { formatRunDuration } from './RunTreeView'
import { apiErrorMessage } from './rfcLifecycle'
import type { Protocol, ProtocolRun } from '@/types/protocol'

// ---------------------------------------------------------------------------
// Trigger mode visuals
// ---------------------------------------------------------------------------

const TRIGGER_MODE: Record<string, { label: string; icon: LucideIcon }> = {
  scheduled: { label: 'Scheduled', icon: Calendar },
  auto: { label: 'Auto', icon: Zap },
  event: { label: 'Event', icon: Radio },
  webhook: { label: 'Webhook', icon: Webhook },
}

export function triggerModeMeta(mode: string | undefined): { label: string; icon: LucideIcon } {
  return TRIGGER_MODE[mode ?? ''] ?? { label: mode ? humanizeStatus(mode) : 'Auto', icon: Zap }
}

/** Human summary of a trigger configuration (cron, webhook URL, event pattern…). */
export function formatTriggerConfig(config: Record<string, unknown>): string {
  if (config.cron) return `${config.cron}`
  if (config.webhook_url) return `${config.webhook_url}`
  if (config.event_pattern) return `${config.event_pattern}`
  if (config.interval) return `every ${config.interval}`
  const entries = Object.entries(config)
  if (entries.length > 0) {
    const [key, value] = entries[0]
    return `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`
  }
  return 'No config'
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScheduledProtocol {
  protocol: Protocol
  latestRun?: ProtocolRun
  loadingRun: boolean
}

interface ScheduledActionsPanelProps {
  protocols: Protocol[]
  onTrigger?: (protocolId: string) => void
  /** Link target of a row (protocol detail). */
  protocolHref?: (protocolId: string) => string
  className?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScheduledActionsPanel({ protocols, onTrigger, protocolHref, className = '' }: ScheduledActionsPanelProps) {
  const toast = useToast()
  const scheduled = useMemo(() => protocols.filter((p) => p.trigger_mode && p.trigger_mode !== 'manual'), [protocols])

  const [items, setItems] = useState<ScheduledProtocol[]>([])
  const [triggeringId, setTriggeringId] = useState<string | null>(null)

  const fetchLatestRuns = useCallback(async () => {
    // Keep already-known runs while refreshing (no flash / layout shift)
    setItems((prev) =>
      scheduled.map((p) => {
        const known = prev.find((i) => i.protocol.id === p.id)
        return { protocol: p, latestRun: known?.latestRun, loadingRun: !known?.latestRun }
      }),
    )
    const updated = await Promise.all(
      scheduled.map(async (p) => {
        try {
          const res = await protocolApi.listRuns(p.id, { limit: 1 })
          return { protocol: p, latestRun: res.items[0], loadingRun: false }
        } catch {
          return { protocol: p, loadingRun: false }
        }
      }),
    )
    setItems(updated)
  }, [scheduled])

  useEffect(() => {
    if (scheduled.length > 0) fetchLatestRuns()
    else setItems([])
  }, [fetchLatestRuns, scheduled.length])

  const handleTrigger = useCallback(
    async (protocol: Protocol) => {
      setTriggeringId(protocol.id)
      try {
        await protocolApi.startRun(protocol.id)
        toast.success(`Run started for ${protocol.name}`)
        onTrigger?.(protocol.id)
        await fetchLatestRuns()
      } catch (err) {
        toast.error(apiErrorMessage(err, 'Failed to start the run'))
      } finally {
        setTriggeringId(null)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is stable (Jotai setter)
    [onTrigger, fetchLatestRuns],
  )

  if (scheduled.length === 0) {
    return (
      <EmptyState
        className={className}
        title="No automatic protocols"
        description="Protocols whose trigger mode is auto, scheduled, event or webhook appear here, with their latest run."
      />
    )
  }

  return (
    <EntityList aria-label="Automatic protocols" className={className}>
      {items.map(({ protocol, latestRun, loadingRun }) => {
        const mode = triggerModeMeta(protocol.trigger_mode)
        const ModeIcon = mode.icon
        const isTriggering = triggeringId === protocol.id
        const config = protocol.trigger_config ? formatTriggerConfig(protocol.trigger_config) : null
        return (
          <EntityRow
            key={protocol.id}
            title={protocol.name}
            href={protocolHref?.(protocol.id)}
            description={protocol.description}
            leading={<ModeIcon className="w-3.5 h-3.5 text-gray-500" aria-hidden="true" />}
            meta={[
              <span key="mode" className="text-gray-400">{mode.label}</span>,
              config ? (
                <span key="cfg" className="font-mono text-gray-400 truncate max-w-[14rem] sm:max-w-[22rem]" title={config}>
                  {config}
                </span>
              ) : null,
              protocol.last_triggered_at ? (
                <RelativeTime key="last" date={protocol.last_triggered_at} prefix="triggered " />
              ) : (
                <span key="never">never triggered</span>
              ),
            ]}
            context={
              loadingRun ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-gray-600">
                  <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> Loading latest run…
                </span>
              ) : latestRun ? (
                <span className="inline-flex flex-wrap items-center gap-x-1.5 text-[11px] leading-4 text-gray-500">
                  Latest run
                  <StatusText kind="run" status={latestRun.status} pulse={latestRun.status === 'running'} />
                  {latestRun.completed_at && (
                    <span className="tabular-nums">· took {formatRunDuration(latestRun.started_at, latestRun.completed_at)}</span>
                  )}
                </span>
              ) : (
                <span className="text-[11px] text-gray-600">No runs yet</span>
              )
            }
            actions={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleTrigger(protocol)}
                loading={isTriggering}
                aria-label={`Run ${protocol.name} now`}
                className="gap-1.5"
              >
                {!isTriggering && <Play className="w-3.5 h-3.5" aria-hidden="true" />}
                Run now
              </Button>
            }
          />
        )
      })}
    </EntityList>
  )
}
