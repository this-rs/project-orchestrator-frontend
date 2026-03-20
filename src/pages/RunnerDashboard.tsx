/**
 * RunnerDashboard — real-time view of a plan's runner execution.
 *
 * Wave-centric layout: agents are grouped by wave, each wave is a collapsible
 * accordion section. Conversations open inline below the wave (full width).
 *
 * Active wave = auto-expanded, completed waves = collapsed, pending = collapsed.
 */

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ChevronDown,
  ChevronRight,
  Activity,
  Clock,
  DollarSign,
  Layers,
  ArrowLeft,
  GitBranch,
  CheckCircle2,
  Users,
  Rocket,
  Eye,
  Wifi,
  WifiOff,
  Loader2,
  X,
  ExternalLink,
  Square,
  FileCode2,
  GitCommitHorizontal,
  Wrench,
} from 'lucide-react'
import { Card, CardContent, LoadingPage, ErrorState, ProgressBar, PulseIndicator } from '@/components/ui'
import { CancelButton } from '@/components/runner/CancelButton'
import { DiscussionTreeView } from '@/components/discussions/DiscussionTreeView'
import { chatApi } from '@/services/chat'
import { plansApi } from '@/services/plans'
import { runnerApi, useRunnerStatus } from '@/services/runner'
import type { ActiveAgentSnapshot, PlanRun, RunSnapshot } from '@/services/runner'
import type { AgentExecution, WaveComputationResult } from '@/types'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import { createWebSocket, ReadyState, type IWebSocket } from '@/services/wsAdapter'
import { wsUrl } from '@/services/env'
import { fetchWsTicket } from '@/services/auth'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatElapsed(secs: number | undefined | null): string {
  const v = secs ?? 0
  const m = Math.floor(v / 60)
  const s = Math.floor(v % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatCost(usd: number | undefined | null): string {
  return `$${(usd ?? 0).toFixed(2)}`
}

const runStatusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  running:          { label: 'Running',          bg: 'bg-blue-500/15',   text: 'text-blue-400',   dot: 'bg-blue-400' },
  completed:        { label: 'Completed',        bg: 'bg-green-500/15',  text: 'text-green-400',  dot: 'bg-green-400' },
  failed:           { label: 'Failed',           bg: 'bg-red-500/15',    text: 'text-red-400',    dot: 'bg-red-400' },
  cancelled:        { label: 'Cancelled',        bg: 'bg-gray-500/15',   text: 'text-gray-400',   dot: 'bg-gray-400' },
  budget_exceeded:  { label: 'Budget Exceeded',  bg: 'bg-yellow-500/15', text: 'text-yellow-400', dot: 'bg-yellow-400' },
}

// ---------------------------------------------------------------------------
// Agent executions lookup by task_id
// ---------------------------------------------------------------------------

function useAgentExecutionsMap(runId: string | null | undefined) {
  const [execMap, setExecMap] = useState<Map<string, AgentExecution>>(new Map())

  const fetchExecutions = useCallback(async () => {
    if (!runId) return
    try {
      const execs = await chatApi.getAgentExecutions(runId)
      const map = new Map<string, AgentExecution>()
      for (const e of execs) map.set(e.task_id, e)
      setExecMap(map)
    } catch {
      // Endpoint may not be available yet — graceful fallback
    }
  }, [runId])

  useEffect(() => { fetchExecutions() }, [fetchExecutions])

  return execMap
}

// ---------------------------------------------------------------------------
// Historical PlanRun fallback — for completed/failed runs
// ---------------------------------------------------------------------------

function useLatestPlanRun(planId: string | undefined) {
  const [planRun, setPlanRun] = useState<PlanRun | null>(null)

  useEffect(() => {
    if (!planId) return
    runnerApi.listPlanRuns(planId, 1).then((runs) => {
      if (runs.length > 0) setPlanRun(runs[0])
    }).catch(() => {})
  }, [planId])

  return planRun
}

// ---------------------------------------------------------------------------
// Root session for a run — resolves run_id → root ChatSession ID
// ---------------------------------------------------------------------------

function useRunRootSession(runId: string | null | undefined) {
  const [rootSessionId, setRootSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!runId) { setRootSessionId(null); setLoading(false); return }
    setLoading(true)
    chatApi.getRunSessions(runId).then((sessions) => {
      if (sessions.length > 0) {
        setRootSessionId(sessions[0].id)
      } else {
        setRootSessionId(null)
      }
    }).catch(() => {
      setRootSessionId(null)
    }).finally(() => {
      setLoading(false)
    })
  }, [runId])

  return { rootSessionId, loading }
}

// ---------------------------------------------------------------------------
// Waves data hook
// ---------------------------------------------------------------------------

function useWavesData(planId: string | undefined) {
  const [waves, setWaves] = useState<WaveComputationResult | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!planId) return
    setLoading(true)
    plansApi.getWaves(planId).then((data) => {
      setWaves(data)
    }).catch(() => {
      setWaves(null)
    }).finally(() => {
      setLoading(false)
    })
  }, [planId])

  return { waves, loading }
}

// ---------------------------------------------------------------------------
// WebSocket conversation hook (extracted from ConversationPanel for reuse)
// ---------------------------------------------------------------------------

interface ConversationMessage {
  id: string
  type: 'text' | 'tool_use' | 'tool_result' | 'system' | 'error' | 'unknown'
  content: string
  timestamp: number
}

type WsStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_BASE_DELAY = 1500

function useConversationWs(sessionId: string | null) {
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [status, setStatus] = useState<WsStatus>('disconnected')
  const wsRef = useRef<IWebSocket | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldReconnectRef = useRef(true)
  const authenticatedRef = useRef(false)
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId
  const nextIdRef = useRef(0)

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.onmessage = null
      wsRef.current.onclose = null
      wsRef.current.onerror = null
      wsRef.current.close()
      wsRef.current = null
    }
    authenticatedRef.current = false
  }, [])

  const parseMessage = useCallback((data: unknown): ConversationMessage | null => {
    if (!data || typeof data !== 'object') return null
    const d = data as Record<string, unknown>
    const id = String(++nextIdRef.current)
    const timestamp = Date.now()

    if (d.type === 'assistant_message' || d.type === 'text') {
      const content = typeof d.content === 'string'
        ? d.content
        : typeof d.text === 'string' ? d.text : JSON.stringify(d)
      return { id, type: 'text', content, timestamp }
    }
    if (d.type === 'tool_use') {
      const name = (d.name as string) || 'tool'
      const input = d.input ? JSON.stringify(d.input, null, 2) : ''
      return { id, type: 'tool_use', content: `${name}\n${input}`, timestamp }
    }
    if (d.type === 'tool_result') {
      const content = typeof d.content === 'string'
        ? d.content
        : typeof d.output === 'string' ? d.output : JSON.stringify(d)
      return { id, type: 'tool_result', content, timestamp }
    }
    if (d.type === 'system') return { id, type: 'system', content: String(d.message || d.content || ''), timestamp }
    if (d.type === 'error') return { id, type: 'error', content: String(d.message || d.error || ''), timestamp }
    if (
      d.type === 'auth_ok' || d.type === 'auth_error' ||
      d.type === 'replay_complete' || d.type === 'events_lagged' ||
      d.type === 'session_dormant' || d.type === 'session_closed' ||
      d.type === 'result'
    ) return null
    if (d.content || d.text || d.message) {
      return { id, type: 'unknown', content: String(d.content || d.text || d.message), timestamp }
    }
    return null
  }, [])

  const connect = useCallback(async () => {
    const sid = sessionIdRef.current
    if (!sid) return
    setStatus('connecting')
    authenticatedRef.current = false
    try {
      const ticket = await fetchWsTicket()
      const params = new URLSearchParams({ last_event: '0' })
      if (ticket) params.set('ticket', ticket)
      const url = wsUrl(`/ws/chat/${sid}?${params.toString()}`)
      const ws = await createWebSocket(url, {
        onopen: () => { reconnectAttemptsRef.current = 0 },
        onmessage: (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data as string)
            if (!authenticatedRef.current) {
              if (data.type === 'auth_ok') { authenticatedRef.current = true; setStatus('connected'); return }
              if (data.type === 'auth_error') { shouldReconnectRef.current = false; wsRef.current?.close(); return }
            }
            if (data.type === 'replay_complete' || data.type === 'events_lagged' || data.type === 'session_dormant') return
            if (data.type === 'session_closed') { shouldReconnectRef.current = false; setStatus('disconnected'); return }
            const msg = parseMessage(data)
            if (msg) setMessages(prev => [...prev, msg])
          } catch { /* ignore */ }
        },
        onclose: () => {
          wsRef.current = null
          authenticatedRef.current = false
          if (shouldReconnectRef.current && sessionIdRef.current === sid) {
            setStatus('reconnecting')
            scheduleReconnect()
          } else {
            setStatus('disconnected')
          }
        },
        onerror: () => {},
      })
      wsRef.current = ws
      if (ws.readyState === ReadyState.OPEN) {
        ws.send('"ready"')
      } else if (ws.readyState === ReadyState.CONNECTING) {
        const origOnopen = ws.onopen
        ws.onopen = (ev: Event) => {
          if (origOnopen) (origOnopen as (ev: Event) => void)(ev)
          ws.send('"ready"')
        }
      }
    } catch { scheduleReconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parseMessage])

  function scheduleReconnect() {
    if (reconnectTimerRef.current) return
    reconnectAttemptsRef.current++
    if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
      setStatus('disconnected'); shouldReconnectRef.current = false; return
    }
    const delay = RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttemptsRef.current - 1)
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null
      if (shouldReconnectRef.current && sessionIdRef.current) connect()
    }, Math.min(delay, 30000))
  }

  useEffect(() => {
    cleanup()
    setMessages([])
    if (sessionId) {
      shouldReconnectRef.current = true
      reconnectAttemptsRef.current = 0
      connect()
    } else { setStatus('disconnected') }
    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  return { messages, status }
}

// ---------------------------------------------------------------------------
// Inline Conversation Panel (full-width, under the wave)
// ---------------------------------------------------------------------------

const typeStyles: Record<ConversationMessage['type'], { label: string; border: string; bg: string; text: string }> = {
  text:        { label: 'Assistant', border: 'border-blue-500/20',   bg: 'bg-blue-500/[0.04]',   text: 'text-blue-400' },
  tool_use:    { label: 'Tool Use',  border: 'border-purple-500/20', bg: 'bg-purple-500/[0.04]', text: 'text-purple-400' },
  tool_result: { label: 'Result',    border: 'border-cyan-500/20',   bg: 'bg-cyan-500/[0.04]',   text: 'text-cyan-400' },
  system:      { label: 'System',    border: 'border-gray-500/20',   bg: 'bg-white/[0.02]',      text: 'text-gray-500' },
  error:       { label: 'Error',     border: 'border-red-500/20',    bg: 'bg-red-500/[0.04]',    text: 'text-red-400' },
  unknown:     { label: 'Event',     border: 'border-gray-500/20',   bg: 'bg-white/[0.02]',      text: 'text-gray-500' },
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const style = typeStyles[message.type] ?? typeStyles.unknown
  return (
    <div className={`border-l-2 ${style.border} ${style.bg} rounded-r-md px-3 py-2`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-[10px] font-medium uppercase ${style.text}`}>{style.label}</span>
      </div>
      <pre className="text-xs text-gray-300 whitespace-pre-wrap break-words font-mono leading-relaxed max-h-60 overflow-y-auto">
        {message.content}
      </pre>
    </div>
  )
}

function WsStatusIndicator({ status }: { status: WsStatus }) {
  if (status === 'connected') return (
    <span className="flex items-center gap-1.5 text-[11px] text-green-400"><Wifi className="w-3 h-3" />Live</span>
  )
  if (status === 'connecting' || status === 'reconnecting') return (
    <span className="flex items-center gap-1.5 text-[11px] text-yellow-400">
      <Loader2 className="w-3 h-3 animate-spin" />
      {status === 'connecting' ? 'Connecting...' : 'Reconnecting...'}
    </span>
  )
  return <span className="flex items-center gap-1.5 text-[11px] text-gray-500"><WifiOff className="w-3 h-3" />Disconnected</span>
}

function InlineConversation({ sessionId, taskTitle, onClose }: { sessionId: string; taskTitle: string; onClose: () => void }) {
  const { messages, status } = useConversationWs(sessionId)
  const scrollRef = useRef<HTMLDivElement>(null)
  const wsSlug = useWorkspaceSlug()
  const [stopping, setStopping] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  const handleStop = async () => {
    setStopping(true)
    try { await chatApi.interruptSession(sessionId) } catch { /* ignore */ }
    finally { setStopping(false) }
  }

  return (
    <div className="border border-indigo-500/20 rounded-lg bg-[#0d0d1a] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-indigo-500/10 bg-indigo-500/[0.03]">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Eye className="w-4 h-4 text-indigo-400 flex-shrink-0" />
          <h4 className="text-sm font-medium text-gray-200 truncate">{taskTitle}</h4>
          <WsStatusIndicator status={status} />
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {status === 'connected' && (
            <button
              onClick={handleStop}
              disabled={stopping}
              className="p-1.5 rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/[0.1] transition-colors cursor-pointer disabled:opacity-50"
              title="Stop session"
            >
              {stopping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
            </button>
          )}
          <Link
            to={workspacePath(wsSlug, `/chat/${sessionId}`)}
            className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-colors"
            title="View full conversation"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {/* Messages */}
      <div ref={scrollRef} className="max-h-[400px] overflow-y-auto p-4 space-y-2">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-gray-500">
              {status === 'connected' ? 'Waiting for messages...' : status === 'connecting' ? 'Connecting to agent...' : 'No messages yet'}
            </p>
          </div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Agent status badge config
// ---------------------------------------------------------------------------

type AgentStatus = ActiveAgentSnapshot['status']

const agentStatusConfig: Record<AgentStatus, { label: string; bg: string; text: string; dot: string }> = {
  spawning:   { label: 'Spawning',   bg: 'bg-yellow-500/15', text: 'text-yellow-400', dot: 'bg-yellow-400' },
  running:    { label: 'Running',    bg: 'bg-blue-500/15',   text: 'text-blue-400',   dot: 'bg-blue-400' },
  verifying:  { label: 'Verifying',  bg: 'bg-purple-500/15', text: 'text-purple-400', dot: 'bg-purple-400' },
  completed:  { label: 'Completed',  bg: 'bg-green-500/15',  text: 'text-green-400',  dot: 'bg-green-400' },
  failed:     { label: 'Failed',     bg: 'bg-red-500/15',    text: 'text-red-400',    dot: 'bg-red-400' },
}

// ---------------------------------------------------------------------------
// Wave Agent Card (compact card within a wave section)
// ---------------------------------------------------------------------------

function WaveAgentCard({
  agent,
  execution,
  isSelected,
  onToggleConversation,
}: {
  agent: ActiveAgentSnapshot
  execution?: AgentExecution
  isSelected: boolean
  onToggleConversation: (sessionId: string, taskTitle: string) => void
}) {
  const cfg = agentStatusConfig[agent.status] ?? agentStatusConfig.running
  const [detailOpen, setDetailOpen] = useState(false)
  const isLive = agent.status === 'running' || agent.status === 'spawning' || agent.status === 'verifying'

  const tools = useMemo(() => {
    if (!execution?.tools_used) return []
    try {
      const parsed = JSON.parse(execution.tools_used)
      return Array.isArray(parsed) ? parsed.map(String) : []
    } catch { return [] }
  }, [execution?.tools_used])

  return (
    <div
      className={`
        rounded-lg border p-3 transition-all duration-200
        ${isSelected
          ? 'border-indigo-500/40 bg-indigo-500/[0.06] shadow-[0_0_12px_rgba(99,102,241,0.1)]'
          : 'border-border-subtle bg-white/[0.04] hover:bg-white/[0.06] hover:border-border-default'
        }
      `}
    >
      {/* Header: title + status */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-medium text-gray-200 leading-snug line-clamp-2 flex-1 min-w-0">
          {agent.task_title}
        </h4>
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${cfg.bg} ${cfg.text}`}>
          {isLive && <PulseIndicator variant="active" size={6} />}
          {!isLive && <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />}
          {cfg.label}
        </span>
      </div>

      {/* Metrics */}
      <div className="flex items-center gap-4 text-xs text-gray-500 mb-2">
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span className="font-mono tabular-nums">{formatElapsed(agent.elapsed_secs)}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <DollarSign className="w-3 h-3" />
          <span className="font-mono tabular-nums">{formatCost(agent.cost_usd)}</span>
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {agent.session_id && (
          <button
            onClick={() => onToggleConversation(agent.session_id!, agent.task_title)}
            className={`
              flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
              transition-colors cursor-pointer
              ${isSelected
                ? 'bg-indigo-500/20 text-indigo-300'
                : 'bg-white/[0.06] text-gray-400 hover:bg-white/[0.1] hover:text-gray-200'
              }
            `}
          >
            <Eye className="w-3.5 h-3.5" />
            {isSelected ? 'Viewing' : 'Conversation'}
            {isLive && !isSelected && (
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            )}
          </button>
        )}
        {execution && (
          <button
            onClick={() => setDetailOpen(!detailOpen)}
            className="flex items-center justify-center p-1.5 rounded-md text-xs text-gray-500 bg-white/[0.06] hover:bg-white/[0.1] hover:text-gray-300 transition-colors cursor-pointer"
            title={detailOpen ? 'Hide details' : 'Show details'}
          >
            {detailOpen ? <ChevronDown className="w-3.5 h-3.5 rotate-180" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Expandable execution detail */}
      {detailOpen && execution && (
        <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2">
          {execution.files_modified.length > 0 && (
            <div className="space-y-1">
              <h5 className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Files modified</h5>
              <ul className="space-y-0.5">
                {execution.files_modified.map((file) => (
                  <li key={file} className="flex items-center gap-1.5 text-xs text-gray-400">
                    <FileCode2 className="w-3 h-3 text-gray-500 shrink-0" />
                    <span className="truncate font-mono">{file}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {execution.commits.length > 0 && (
            <div className="space-y-1">
              <h5 className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Commits</h5>
              <ul className="space-y-0.5">
                {execution.commits.map((sha) => (
                  <li key={sha} className="flex items-center gap-1.5 text-xs text-gray-400">
                    <GitCommitHorizontal className="w-3 h-3 text-gray-500 shrink-0" />
                    <span className="font-mono">{sha.slice(0, 7)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {tools.length > 0 && (
            <div className="space-y-1">
              <h5 className="text-[10px] font-medium text-gray-500 uppercase tracking-wider flex items-center gap-1">
                <Wrench className="w-3 h-3" /> Tools used
              </h5>
              <div className="flex flex-wrap gap-1">
                {tools.map((tool) => (
                  <span key={tool} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/[0.06] text-gray-400">
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Wave Section (collapsible accordion for a wave)
// ---------------------------------------------------------------------------

type WaveStatus = 'active' | 'completed' | 'pending' | 'partial'

function getWaveStatus(agents: ActiveAgentSnapshot[]): WaveStatus {
  if (agents.length === 0) return 'pending'
  const hasRunning = agents.some(a => a.status === 'running' || a.status === 'spawning' || a.status === 'verifying')
  if (hasRunning) return 'active'
  const allDone = agents.every(a => a.status === 'completed' || a.status === 'failed')
  if (allDone) return 'completed'
  return 'partial'
}

const waveStatusStyles: Record<WaveStatus, { border: string; bg: string; badge: string; badgeText: string }> = {
  active:    { border: 'border-indigo-500/30', bg: 'bg-indigo-500/[0.02]', badge: 'bg-indigo-500/15', badgeText: 'text-indigo-400' },
  completed: { border: 'border-green-500/20',  bg: 'bg-green-500/[0.01]',  badge: 'bg-green-500/15',  badgeText: 'text-green-400' },
  pending:   { border: 'border-border-subtle',  bg: 'bg-white/[0.01]',     badge: 'bg-white/[0.08]',  badgeText: 'text-gray-500' },
  partial:   { border: 'border-yellow-500/20', bg: 'bg-yellow-500/[0.01]', badge: 'bg-yellow-500/15', badgeText: 'text-yellow-400' },
}

const waveStatusLabels: Record<WaveStatus, string> = {
  active: 'Active',
  completed: 'Completed',
  pending: 'Pending',
  partial: 'Partial',
}

interface WaveSectionProps {
  waveNumber: number
  taskIds: string[]
  agents: ActiveAgentSnapshot[]
  executionsMap: Map<string, AgentExecution>
  selectedConversation: { sessionId: string; taskTitle: string } | null
  onToggleConversation: (sessionId: string, taskTitle: string) => void
  onCloseConversation: () => void
  defaultOpen: boolean
}

function WaveSection({
  waveNumber,
  taskIds,
  agents,
  executionsMap,
  selectedConversation,
  onToggleConversation,
  onCloseConversation,
  defaultOpen,
}: WaveSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const waveStatus = getWaveStatus(agents)
  const styles = waveStatusStyles[waveStatus]

  const completedCount = agents.filter(a => a.status === 'completed').length
  const failedCount = agents.filter(a => a.status === 'failed').length
  const totalCount = taskIds.length
  const waveCost = agents.reduce((sum, a) => sum + a.cost_usd, 0)
  const waveTime = agents.reduce((max, a) => Math.max(max, a.elapsed_secs), 0)

  // Check if the selected conversation belongs to this wave
  const conversationInThisWave = selectedConversation && agents.some(a => a.session_id === selectedConversation.sessionId)

  return (
    <div className={`rounded-lg border ${styles.border} ${styles.bg} transition-all duration-200`}>
      {/* Wave header (clickable) */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left cursor-pointer"
      >
        <div className="flex items-center gap-3">
          {open
            ? <ChevronDown className="w-4 h-4 text-gray-500" />
            : <ChevronRight className="w-4 h-4 text-gray-500" />
          }
          <span className="text-sm font-semibold text-gray-200">
            Wave {waveNumber}
          </span>
          {waveStatus === 'active' && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 text-[10px] font-medium">
              <Activity className="w-3 h-3" />
              Active
            </span>
          )}
          {waveStatus !== 'active' && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${styles.badge} ${styles.badgeText}`}>
              {waveStatusLabels[waveStatus]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          {failedCount > 0 && (
            <span className="text-red-400">{failedCount} failed</span>
          )}
          <span>{completedCount}/{totalCount} tasks</span>
          {waveCost > 0 && (
            <span className="font-mono tabular-nums">{formatCost(waveCost)}</span>
          )}
          {waveTime > 0 && (
            <span className="font-mono tabular-nums">{formatElapsed(waveTime)}</span>
          )}
        </div>
      </button>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="px-4 pb-1">
          <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                failedCount > 0 ? 'bg-red-500/70' : 'bg-green-500/70'
              }`}
              style={{ width: `${((completedCount + failedCount) / totalCount) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Expanded content */}
      {open && (
        <div className="px-4 pb-4 pt-2 space-y-3">
          {/* Agent cards grid */}
          {agents.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {agents.map((agent, idx) => (
                <WaveAgentCard
                  key={`${agent.task_id}-${idx}`}
                  agent={agent}
                  execution={executionsMap.get(agent.task_id)}
                  isSelected={selectedConversation?.sessionId === agent.session_id}
                  onToggleConversation={onToggleConversation}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500 py-2">
              {waveStatus === 'pending' ? 'Waiting for previous waves to complete...' : 'No agents for this wave.'}
            </p>
          )}

          {/* Inline conversation panel (full width, below agent cards) */}
          {conversationInThisWave && selectedConversation && (
            <InlineConversation
              sessionId={selectedConversation.sessionId}
              taskTitle={selectedConversation.taskTitle}
              onClose={onCloseConversation}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// RunnerDashboard
// ---------------------------------------------------------------------------

type DashboardTab = 'waves' | 'discussions'

export function RunnerDashboard() {
  const { planId } = useParams<{ planId: string }>()
  const wsSlug = useWorkspaceSlug()
  const { snapshot, isRunning, error, refresh } = useRunnerStatus(planId)

  // Historical fallback
  const latestRun = useLatestPlanRun(planId)

  // Fetch wave structure
  const { waves: wavesData, loading: wavesLoading } = useWavesData(planId)

  // Build effective snapshot
  const effectiveSnapshot: RunSnapshot | null = useMemo(() => {
    if (!snapshot) return null
    if (snapshot.running || snapshot.run_id) return snapshot
    if (latestRun) {
      const elapsed = latestRun.completed_at
        ? (new Date(latestRun.completed_at).getTime() - new Date(latestRun.started_at).getTime()) / 1000
        : 0
      const totalDone = latestRun.completed_tasks.length + latestRun.failed_tasks.length
      return {
        running: false,
        run_id: latestRun.run_id,
        plan_id: latestRun.plan_id,
        status: latestRun.status as RunSnapshot['status'],
        current_wave: latestRun.current_wave,
        current_task_id: latestRun.current_task_id,
        current_task_title: latestRun.current_task_title,
        active_agents: latestRun.active_agents ?? [],
        progress_pct: latestRun.total_tasks > 0 ? (totalDone / latestRun.total_tasks) * 100 : 0,
        tasks_completed: latestRun.completed_tasks.length,
        tasks_total: latestRun.total_tasks,
        elapsed_secs: elapsed,
        cost_usd: latestRun.cost_usd ?? 0,
      }
    }
    return snapshot
  }, [snapshot, latestRun])

  const effectiveRunId = effectiveSnapshot?.run_id ?? null
  const executionsMap = useAgentExecutionsMap(effectiveRunId)
  const { rootSessionId, loading: rootSessionLoading } = useRunRootSession(effectiveRunId)

  const [activeTab, setActiveTab] = useState<DashboardTab>('waves')
  const [selectedConversation, setSelectedConversation] = useState<{ sessionId: string; taskTitle: string } | null>(null)

  // Build agent list
  const resolvedAgents: ActiveAgentSnapshot[] = useMemo(() => {
    const liveAgents = effectiveSnapshot?.active_agents ?? []
    if (liveAgents.length > 0) return liveAgents
    if (executionsMap.size > 0) {
      return Array.from(executionsMap.values()).map((exec) => ({
        task_id: exec.task_id,
        task_title: exec.task_id.slice(0, 8),
        session_id: exec.session_id ?? null,
        elapsed_secs: exec.duration_secs,
        cost_usd: exec.cost_usd,
        status: exec.status === 'timeout' ? 'failed' : exec.status as ActiveAgentSnapshot['status'],
      }))
    }
    return []
  }, [effectiveSnapshot, executionsMap])

  // Map agents to waves: build a task_id → wave_number lookup
  const taskWaveMap = useMemo(() => {
    const map = new Map<string, number>()
    if (wavesData) {
      for (const wave of wavesData.waves) {
        for (const task of wave.tasks) {
          map.set(task.id, wave.wave_number)
        }
      }
    }
    return map
  }, [wavesData])

  // Group agents by wave
  const waveAgentsMap = useMemo(() => {
    const map = new Map<number, ActiveAgentSnapshot[]>()
    for (const agent of resolvedAgents) {
      const waveNum = taskWaveMap.get(agent.task_id) ?? -1
      const existing = map.get(waveNum) ?? []
      existing.push(agent)
      map.set(waveNum, existing)
    }
    return map
  }, [resolvedAgents, taskWaveMap])

  // Build ordered wave list with task IDs
  const orderedWaves = useMemo<Array<{ waveNumber: number; taskIds: string[]; agents: ActiveAgentSnapshot[] }>>(() => {
    if (!wavesData) {
      // Fallback: no wave data, group all agents in "Wave 1"
      if (resolvedAgents.length > 0) {
        return [{
          waveNumber: 1,
          taskIds: resolvedAgents.map(a => a.task_id),
          agents: resolvedAgents,
        }]
      }
      return []
    }
    return wavesData.waves.map((wave) => ({
      waveNumber: wave.wave_number,
      taskIds: wave.tasks.map(t => t.id),
      agents: waveAgentsMap.get(wave.wave_number) ?? [],
    }))
  }, [wavesData, waveAgentsMap, resolvedAgents])

  const handleToggleConversation = useCallback((sessionId: string, taskTitle: string) => {
    setSelectedConversation(prev =>
      prev?.sessionId === sessionId ? null : { sessionId, taskTitle }
    )
  }, [])

  const handleCloseConversation = useCallback(() => {
    setSelectedConversation(null)
  }, [])

  // Loading / error states
  if (error && !snapshot && !latestRun) {
    return <ErrorState title="Runner not available" description={error} onRetry={refresh} />
  }
  if (!effectiveSnapshot) {
    return <LoadingPage />
  }

  const statusStr = effectiveSnapshot.status ?? (effectiveSnapshot.running ? 'running' : 'completed')
  const statusCfg = runStatusConfig[statusStr] ?? runStatusConfig.running
  const progressPercent = Math.round(effectiveSnapshot.progress_pct ?? 0)
  const planTitle = effectiveSnapshot.current_task_title ?? `Plan ${planId?.slice(0, 8)}...`

  return (
    <div className="pt-6 flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="mb-6 space-y-4 flex-shrink-0">
        {/* Breadcrumb */}
        <Link
          to={workspacePath(wsSlug, `/plans/${planId}`)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to plan
        </Link>

        {/* Title row */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-100">Runner Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">{planTitle}</p>
          </div>
          <div className="flex items-center gap-3">
            <CancelButton planId={planId!} isRunning={isRunning} />
            {effectiveSnapshot.status === 'budget_exceeded' && !isRunning && (
              <Link
                to={workspacePath(wsSlug, `/plans/${planId}`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
              >
                <Rocket className="w-3.5 h-3.5" />
                Relaunch with higher budget
              </Link>
            )}
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot} ${isRunning ? 'animate-pulse' : ''}`} />
              {statusCfg.label}
            </span>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-6 text-sm">
          {effectiveSnapshot.current_wave != null && (
            <div className="flex items-center gap-1.5 text-gray-400">
              <Layers className="w-4 h-4 text-gray-500" />
              <span>Wave {(effectiveSnapshot.current_wave ?? 0) + 1}{wavesData ? ` / ${wavesData.waves.length}` : ''}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-gray-400">
            <CheckCircle2 className="w-4 h-4 text-gray-500" />
            <span>{effectiveSnapshot.tasks_completed ?? 0} / {effectiveSnapshot.tasks_total ?? 0} tasks</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-400">
            <Users className="w-4 h-4 text-gray-500" />
            <span>{resolvedAgents.length} agent{resolvedAgents.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-400">
            <Clock className="w-4 h-4 text-gray-500" />
            <span className="font-mono tabular-nums">{formatElapsed(effectiveSnapshot.elapsed_secs)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-400">
            <DollarSign className="w-4 h-4 text-gray-500" />
            <span className="font-mono tabular-nums">{formatCost(effectiveSnapshot.cost_usd)}</span>
          </div>
        </div>

        {/* Progress bar */}
        <ProgressBar value={progressPercent} />

        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b border-border-subtle">
          <button
            onClick={() => setActiveTab('waves')}
            className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-px ${
              activeTab === 'waves'
                ? 'border-indigo-500 text-gray-200'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              Waves
            </span>
          </button>
          <button
            onClick={() => setActiveTab('discussions')}
            className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-px ${
              activeTab === 'discussions'
                ? 'border-indigo-500 text-gray-200'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5" />
              Discussion Tree
            </span>
          </button>
        </div>
      </div>

      {/* Main content */}
      {activeTab === 'waves' ? (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pb-6">
          {wavesLoading && orderedWaves.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Loader2 className="w-5 h-5 text-gray-500 animate-spin mx-auto mb-2" />
                <p className="text-sm text-gray-500">Loading wave structure...</p>
              </CardContent>
            </Card>
          ) : orderedWaves.length > 0 ? (
            orderedWaves.map((wave) => {
              const wStatus = getWaveStatus(wave.agents)
              const defaultOpen = wStatus === 'active' || wStatus === 'partial' || (wStatus === 'pending' && orderedWaves.every(w => getWaveStatus(w.agents) !== 'active'))
              return (
                <WaveSection
                  key={wave.waveNumber}
                  waveNumber={wave.waveNumber}
                  taskIds={wave.taskIds}
                  agents={wave.agents}
                  executionsMap={executionsMap}
                  selectedConversation={selectedConversation}
                  onToggleConversation={handleToggleConversation}
                  onCloseConversation={handleCloseConversation}
                  defaultOpen={defaultOpen}
                />
              )
            })
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-gray-500">
                  {effectiveSnapshot.running ? 'Waiting for agents to start...' : 'No agents have been spawned.'}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto pb-6 pt-3">
          {rootSessionId ? (
            <DiscussionTreeView sessionId={rootSessionId} />
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-gray-500">
                  {rootSessionLoading
                    ? 'Loading discussion tree...'
                    : 'No discussion sessions found for this run.'}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
