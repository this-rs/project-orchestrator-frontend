/**
 * Shared helpers and config constants for runner components.
 */

import type { ActiveAgentSnapshot } from '@/services/runner'

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

export function formatElapsed(secs: number | undefined | null): string {
  const v = secs ?? 0
  const m = Math.floor(v / 60)
  const s = Math.floor(v % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function formatCost(usd: number | undefined | null): string {
  return `$${(usd ?? 0).toFixed(2)}`
}

// ---------------------------------------------------------------------------
// Run status config
// ---------------------------------------------------------------------------

export const runStatusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  running:          { label: 'Running',          bg: 'bg-blue-500/15',   text: 'text-blue-400',   dot: 'bg-blue-400' },
  completed:        { label: 'Completed',        bg: 'bg-green-500/15',  text: 'text-green-400',  dot: 'bg-green-400' },
  failed:           { label: 'Failed',           bg: 'bg-red-500/15',    text: 'text-red-400',    dot: 'bg-red-400' },
  cancelled:        { label: 'Cancelled',        bg: 'bg-gray-500/15',   text: 'text-gray-400',   dot: 'bg-gray-400' },
  budget_exceeded:  { label: 'Budget Exceeded',  bg: 'bg-yellow-500/15', text: 'text-yellow-400', dot: 'bg-yellow-400' },
}

// ---------------------------------------------------------------------------
// Agent status config
// ---------------------------------------------------------------------------

type AgentStatus = ActiveAgentSnapshot['status']

export const agentStatusConfig: Record<AgentStatus, { label: string; bg: string; text: string; dot: string }> = {
  spawning:   { label: 'Spawning',   bg: 'bg-yellow-500/15', text: 'text-yellow-400', dot: 'bg-yellow-400' },
  running:    { label: 'Running',    bg: 'bg-blue-500/15',   text: 'text-blue-400',   dot: 'bg-blue-400' },
  verifying:  { label: 'Verifying',  bg: 'bg-purple-500/15', text: 'text-purple-400', dot: 'bg-purple-400' },
  completed:  { label: 'Completed',  bg: 'bg-green-500/15',  text: 'text-green-400',  dot: 'bg-green-400' },
  failed:     { label: 'Failed',     bg: 'bg-red-500/15',    text: 'text-red-400',    dot: 'bg-red-400' },
}

/** Maps agent status to Badge variant for the UI Badge component. */
export const agentStatusBadgeVariant: Record<AgentStatus, 'default' | 'success' | 'warning' | 'error' | 'info' | 'purple'> = {
  spawning:  'warning',
  running:   'info',
  verifying: 'purple',
  completed: 'success',
  failed:    'error',
}

// ---------------------------------------------------------------------------
// Wave status types & config
// ---------------------------------------------------------------------------

export type WaveStatus = 'active' | 'completed' | 'failed' | 'pending' | 'partial'

export function getWaveStatus(agents: ActiveAgentSnapshot[]): WaveStatus {
  if (agents.length === 0) return 'pending'
  const hasRunning = agents.some(a => a.status === 'running' || a.status === 'spawning' || a.status === 'verifying')
  if (hasRunning) return 'active'
  const allDone = agents.every(a => a.status === 'completed' || a.status === 'failed')
  if (allDone) {
    const hasFailed = agents.some(a => a.status === 'failed')
    if (hasFailed) return 'failed'
    return 'completed'
  }
  return 'partial'
}

export const waveStatusStyles: Record<WaveStatus, { border: string; bg: string; badge: string; badgeText: string }> = {
  active:    { border: 'border-indigo-500/30', bg: 'bg-indigo-500/[0.02]', badge: 'bg-indigo-500/15', badgeText: 'text-indigo-400' },
  completed: { border: 'border-green-500/20',  bg: 'bg-green-500/[0.01]',  badge: 'bg-green-500/15',  badgeText: 'text-green-400' },
  failed:    { border: 'border-red-500/30',    bg: 'bg-red-500/[0.02]',    badge: 'bg-red-500/15',    badgeText: 'text-red-400' },
  pending:   { border: 'border-border-subtle',  bg: 'bg-white/[0.01]',     badge: 'bg-white/[0.08]',  badgeText: 'text-gray-500' },
  partial:   { border: 'border-yellow-500/20', bg: 'bg-yellow-500/[0.01]', badge: 'bg-yellow-500/15', badgeText: 'text-yellow-400' },
}

export const waveStatusLabels: Record<WaveStatus, string> = {
  active: 'Active',
  completed: 'Completed',
  failed: 'Failed',
  pending: 'Pending',
  partial: 'Partial',
}
