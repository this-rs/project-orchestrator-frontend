/**
 * ProtocolRunViz — Inline FSM run visualization for chat messages.
 *
 * Shows a compact view of a protocol run's progress: current state,
 * states visited, and status. Renders inline in chat message bubbles
 * when the backend emits a `protocol_run` VizBlock.
 *
 * Data schema (from backend):
 * {
 *   protocol_name: string,
 *   protocol_id: string,
 *   run_id: string,
 *   status: 'running' | 'completed' | 'failed' | 'cancelled',
 *   current_state: string,
 *   current_state_name: string,
 *   states_visited: [{ state_name: string, entered_at: string, trigger?: string }],
 *   total_states: number,
 *   triggered_by: string,
 *   error?: string,
 * }
 */
import { Workflow, Play, CheckCircle2, XCircle, Ban, ArrowRight } from 'lucide-react'
import type { VizBlockProps } from './registry'

// ============================================================================
// Status styling
// ============================================================================

interface StateVisitEntry {
  state_name: string
  entered_at: string
  trigger?: string
}

const STATUS_STYLES: Record<string, { icon: typeof Workflow; color: string; bg: string; label: string }> = {
  running:   { icon: Play,         color: 'text-cyan-400',    bg: 'bg-cyan-500/20',  label: 'Running' },
  completed: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/20', label: 'Completed' },
  failed:    { icon: XCircle,      color: 'text-red-400',     bg: 'bg-red-500/20',   label: 'Failed' },
  cancelled: { icon: Ban,          color: 'text-gray-400',    bg: 'bg-gray-500/20',  label: 'Cancelled' },
}

function getStatusStyle(status: string) {
  return STATUS_STYLES[status] ?? STATUS_STYLES.running
}

// ============================================================================
// Main component
// ============================================================================

export function ProtocolRunViz({ data }: VizBlockProps) {
  const protocolName = (data.protocol_name as string) ?? 'Protocol'
  const status = (data.status as string) ?? 'running'
  const currentStateName = (data.current_state_name as string) ?? '—'
  const statesVisited = (data.states_visited as StateVisitEntry[]) ?? []
  const totalStates = (data.total_states as number) ?? 0
  const triggeredBy = (data.triggered_by as string) ?? 'unknown'
  const error = data.error as string | undefined

  const style = getStatusStyle(status)
  const StatusIcon = style.icon
  const progress = totalStates > 0 ? (statesVisited.length / totalStates) * 100 : 0

  return (
    <div className="space-y-2">
      {/* Header: protocol name + status badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Workflow className="w-3.5 h-3.5 text-orange-400 shrink-0" />
          <span className="text-xs font-medium text-gray-200 truncate">{protocolName}</span>
        </div>
        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium ${style.bg} ${style.color} shrink-0`}>
          <StatusIcon className={`w-3 h-3 ${status === 'running' ? 'animate-pulse' : ''}`} />
          <span>{style.label}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] text-gray-500">
          <span>Current: <span className="text-gray-300 font-medium">{currentStateName}</span></span>
          <span>{statesVisited.length}/{totalStates} states</span>
        </div>
        <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              status === 'running' ? 'bg-cyan-500' :
              status === 'completed' ? 'bg-emerald-500' :
              status === 'failed' ? 'bg-red-500' :
              'bg-gray-500'
            }`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </div>

      {/* State trail (compact) */}
      {statesVisited.length > 0 && (
        <div className="flex items-center gap-0.5 flex-wrap text-[10px]">
          {statesVisited.map((sv, i) => (
            <span key={i} className="flex items-center gap-0.5">
              {i > 0 && <ArrowRight className="w-2 h-2 text-gray-600" />}
              <span className={`px-1 py-0.5 rounded ${
                i === statesVisited.length - 1 && status === 'running'
                  ? 'bg-cyan-900/30 text-cyan-300 font-medium'
                  : 'bg-white/[0.04] text-gray-400'
              }`}>
                {sv.state_name}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="bg-red-950/30 border border-red-900/30 rounded-md px-2 py-1">
          <p className="text-[10px] text-red-400">{error}</p>
        </div>
      )}

      {/* Footer: triggered by */}
      <div className="text-[9px] text-gray-600">
        Triggered by: <span className="text-gray-500">{triggeredBy}</span>
      </div>
    </div>
  )
}
