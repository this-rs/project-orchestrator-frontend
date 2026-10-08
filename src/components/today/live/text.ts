import type { LiveAgent } from '@/types/liveAgents'
import { TEXT } from '../text'

/** Words of « Assistants »: a slice of the one registry (`../text`), kept under its historical names. */
export const LIVE_TEXT = TEXT.live

export const STATE_LABEL = TEXT.live.states

/** What started the assistant, in words; an unknown origin is shown as it is, never hidden. */
export function originLabel(origin: string): string {
  return TEXT.live.origins[origin] ?? origin
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

/** "1 waiting for your answer · 3 working" (the idle ones have their own fold). */
export function summaryLine(r: { total: number; waiting_input: number; streaming: number; idle: number }): string {
  if (r.total === 0) return LIVE_TEXT.empty
  const parts: string[] = []
  if (r.waiting_input) parts.push(LIVE_TEXT.waiting(r.waiting_input))
  if (r.streaming) parts.push(LIVE_TEXT.working(r.streaming))
  if (parts.length === 0) return LIVE_TEXT.idle(r.idle)
  return parts.join(' · ')
}

export const agentTitle = (a: LiveAgent) => a.title.trim() || LIVE_TEXT.untitled
