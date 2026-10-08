/**
 * RecentRunsPanel — the most recent protocol runs across a set of protocols
 * (3 latest per protocol, merged, newest first).
 *
 * One EntityRow per run: live dot (pulses only while running), protocol name,
 * status · current state · duration · states visited · short id, start time,
 * and the error message of failed runs (wrapped, never truncated away).
 */

import { useState, useEffect, useCallback } from 'react'
import { protocolApi } from '@/services/protocolApi'
import {
  EmptyState,
  EntityList,
  EntityListSkeleton,
  EntityRow,
  MetaLine,
  RelativeTime,
  StatusDot,
  StatusText,
  ToneText,
  getStatusMeta,
  pluralize,
} from '@/components/ui'
import { formatRunDuration } from './RunTreeView'
import type { Protocol, ProtocolRun } from '@/types/protocol'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RunWithProtocol {
  run: ProtocolRun
  protocolName: string
  protocolId: string
}

interface RecentRunsPanelProps {
  protocols: Protocol[]
  maxRuns?: number
  /** Link target of a run row (preferred — real link). */
  runHref?: (protocolId: string, runId: string) => string
  /** Click handler when rows are not links. */
  onRunClick?: (protocolId: string, runId: string) => void
  className?: string
}

/** Name of the state a run is currently in (or last visited). */
export function runStateName(run: Pick<ProtocolRun, 'current_state_name' | 'states_visited'>): string | undefined {
  return run.current_state_name ?? run.states_visited?.slice(-1)[0]?.state_name
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecentRunsPanel({ protocols, maxRuns = 25, runHref, onRunClick, className = '' }: RecentRunsPanelProps) {
  const [runs, setRuns] = useState<RunWithProtocol[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAllRuns = useCallback(async () => {
    if (protocols.length === 0) {
      setRuns([])
      setLoading(false)
      return
    }
    setLoading(true)
    const results: RunWithProtocol[] = []
    const batches = await Promise.allSettled(
      protocols.map(async (p) => {
        const res = await protocolApi.listRuns(p.id, { limit: 3 })
        return res.items.map((run) => ({ run, protocolName: p.name, protocolId: p.id }))
      }),
    )
    for (const batch of batches) {
      if (batch.status === 'fulfilled') results.push(...batch.value)
    }
    results.sort((a, b) => new Date(b.run.started_at).getTime() - new Date(a.run.started_at).getTime())
    setRuns(results.slice(0, maxRuns))
    setLoading(false)
  }, [protocols, maxRuns])

  useEffect(() => {
    fetchAllRuns()
  }, [fetchAllRuns])

  const runningCount = runs.filter((r) => r.run.status === 'running').length
  const failedCount = runs.filter((r) => r.run.status === 'failed').length

  if (loading) return <EntityListSkeleton rows={5} className={className} />

  if (runs.length === 0) {
    return (
      <EmptyState
        className={className}
        title="No runs yet"
        description="Runs appear here as protocols execute. Start one from a protocol page, or trigger a scheduled protocol."
      />
    )
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <MetaLine
        className="px-1"
        items={[
          runningCount > 0 ? <ToneText key="running" tone="progress" pulse label={`${runningCount} running`} /> : null,
          failedCount > 0 ? <ToneText key="failed" tone="danger" icon label={`${failedCount} failed`} /> : null,
          <span key="total" className="tabular-nums">{pluralize(runs.length, 'recent run')}</span>,
        ]}
      />
      <EntityList aria-label="Recent runs">
        {runs.map(({ run, protocolName, protocolId }) => {
          const running = run.status === 'running'
          const state = runStateName(run)
          const visited = run.states_visited?.length ?? 0
          return (
            <EntityRow
              key={run.id}
              title={protocolName}
              href={runHref?.(protocolId, run.id)}
              onClick={!runHref && onRunClick ? () => onRunClick(protocolId, run.id) : undefined}
              leading={<StatusDot kind="run" status={run.status} pulse={running} label={getStatusMeta('run', run.status).label} />}
              trailing={<RelativeTime date={run.started_at} />}
              meta={[
                <StatusText key="s" kind="run" status={run.status} dot={false} />,
                state ? (
                  <span key="state" className="text-gray-400 break-words">
                    in <span className="text-gray-300">{state}</span>
                  </span>
                ) : null,
                <span key="d" className="tabular-nums">{formatRunDuration(run.started_at, run.completed_at)}</span>,
                visited > 0 ? pluralize(visited, 'state') + ' visited' : null,
                <span key="id" className="font-mono text-gray-600">{run.id.slice(0, 8)}</span>,
              ]}
              context={
                run.error ? <p className="text-xs leading-4 text-red-400/90 break-words line-clamp-3">{run.error}</p> : undefined
              }
              chevron
            />
          )
        })}
      </EntityList>
    </div>
  )
}
