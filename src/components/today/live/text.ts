import type { LiveAgent, LiveAgentState } from '@/types/liveAgents'

export const LIVE_TEXT = {
  title: 'Assistants',
  region: 'Assistants en cours',
  empty: 'Aucun assistant ne tourne en ce moment',
  idle: (n: number) => (n === 1 ? '1 inactif' : `${n} inactifs`),
  emptyHint: 'Quand une conversation démarre (chat, plan, tâche déléguée), elle apparaît ici.',
  loadError: 'La liste des assistants n’a pas pu être chargée.',
  stale: 'Actualisation impossible : la liste affichée peut être périmée.',
  retry: 'Réessayer',
  open: 'Ouvrir',
  untitled: 'Conversation sans titre',
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

/** "1 attend ta réponse · 3 travaillent" (the idle ones have their own fold). */
export function summaryLine(r: { total: number; waiting_input: number; streaming: number; idle: number }): string {
  if (r.total === 0) return LIVE_TEXT.empty
  const parts: string[] = []
  if (r.waiting_input) parts.push(`${r.waiting_input} ${r.waiting_input === 1 ? 'attend' : 'attendent'} ta réponse`)
  if (r.streaming) parts.push(`${r.streaming} ${r.streaming === 1 ? 'travaille' : 'travaillent'}`)
  if (parts.length === 0) return LIVE_TEXT.idle(r.idle)
  return parts.join(' · ')
}

export const agentTitle = (a: LiveAgent) => a.title.trim() || LIVE_TEXT.untitled
