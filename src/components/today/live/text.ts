import type { LiveAgent, LiveAgentState } from '@/types/liveAgents'

export const LIVE_TEXT = {
  title: 'Agents en cours',
  region: 'Agents en cours',
  empty: 'Aucun agent ne tourne en ce moment',
  emptyHint: 'Quand une session démarre (chat, plan, tâche déléguée), elle apparaît ici.',
  loadError: 'La liste des agents n’a pas pu être chargée.',
  stale: 'Actualisation impossible : la liste affichée peut être périmée.',
  retry: 'Réessayer',
  open: 'Ouvrir',
  untitled: 'Session sans titre',
} as const

export const STATE_LABEL: Record<LiveAgentState, string> = {
  waiting_input: 'Attend ta réponse',
  streaming: 'Travaille',
  idle: 'Inactif',
}

const ORIGIN_LABEL: Record<string, string> = {
  user: 'Chat',
  runner: 'Plan',
  pipeline: 'Pipeline',
  gate: 'Gate',
  delegate: 'Tâche déléguée',
  protocol_runner: 'Protocole',
}

/** What started the agent, in words; an unknown origin is shown as it is, never hidden. */
export function originLabel(origin: string): string {
  return ORIGIN_LABEL[origin] ?? origin
}

/** `12s`, `5m`, `1h 5m`, `2d 3h` from seconds. */
export function formatSecs(secs: number): string {
  const s = Math.max(0, Math.floor(secs))
  if (s < 60) return `${s}s`
  const mins = Math.floor(s / 60)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ${mins % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

/** "5 en cours · 1 attend ta réponse · 3 travaillent · 1 inactif". */
export function summaryLine(r: { total: number; waiting_input: number; streaming: number; idle: number }): string {
  if (r.total === 0) return LIVE_TEXT.empty
  const parts = [`${r.total} ${r.total === 1 ? 'agent' : 'agents'}`]
  if (r.waiting_input) parts.push(`${r.waiting_input} ${r.waiting_input === 1 ? 'attend' : 'attendent'} ta réponse`)
  if (r.streaming) parts.push(`${r.streaming} ${r.streaming === 1 ? 'travaille' : 'travaillent'}`)
  if (r.idle) parts.push(`${r.idle} ${r.idle === 1 ? 'inactif' : 'inactifs'}`)
  return parts.join(' · ')
}

export const agentTitle = (a: LiveAgent) => a.title.trim() || LIVE_TEXT.untitled
