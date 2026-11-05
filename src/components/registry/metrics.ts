/**
 * Qualitative levels and plain-language explanations for the Skills &
 * Personas metrics (data only — components live in concepts.tsx).
 */
import type { StatusTone } from '@/components/ui'
import { activeTranslator, type MessageKey } from '@/i18n'

/** Text of a key in the language on screen, read when used (the registry follows the language). */
const tr = (key: MessageKey): string => activeTranslator().t(key)

// ── Levels ──────────────────────────────────────────────────────────────

export interface Level {
  label: string
  tone: StatusTone
}

/** 0–1 → `82%`. */
export function pct(v: number | null | undefined): string {
  return `${Math.round((v ?? 0) * 100)}%`
}

/** Energy (activity) — same thresholds as the historical cards. */
export function energyLevel(v: number): Level {
  if (v >= 0.7) return { label: tr('siteRest.metrics.level.high'), tone: 'success' }
  if (v >= 0.3) return { label: tr('siteRest.metrics.level.medium'), tone: 'warning' }
  return { label: tr('siteRest.metrics.level.low'), tone: 'danger' }
}

/** Cohesion — strong ≥ 0.5 (historical threshold). */
export function cohesionLevel(v: number): Level {
  if (v >= 0.5) return { label: tr('siteRest.metrics.level.strong'), tone: 'progress' }
  return { label: tr('siteRest.metrics.level.weak'), tone: 'neutral' }
}

/** Generic ratio (hit rate, success rate, coverage, freshness). */
export function ratioLevel(v: number): Level {
  if (v >= 0.7) return { label: tr('siteRest.metrics.level.good'), tone: 'success' }
  if (v >= 0.4) return { label: tr('siteRest.metrics.level.fair'), tone: 'warning' }
  return { label: tr('siteRest.metrics.level.poor'), tone: 'danger' }
}

// ── Plain-language explanations ───────────────────────────────────────────
// Getters: each text is read in the language on screen when it is shown.

export const SKILL_HINTS = {
  get energy() { return tr('siteRest.metrics.skillHint.energy') },
  get cohesion() { return tr('siteRest.metrics.skillHint.cohesion') },
  get hitRate() { return tr('siteRest.metrics.skillHint.hitRate') },
  get activations() { return tr('siteRest.metrics.skillHint.activations') },
  get coverage() { return tr('siteRest.metrics.skillHint.coverage') },
  get members() { return tr('siteRest.metrics.skillHint.members') },
}

export const PERSONA_HINTS = {
  get energy() { return tr('siteRest.metrics.personaHint.energy') },
  get cohesion() { return tr('siteRest.metrics.personaHint.cohesion') },
  get successRate() { return tr('siteRest.metrics.personaHint.successRate') },
  get activations() { return tr('siteRest.metrics.personaHint.activations') },
  get avgDuration() { return tr('siteRest.metrics.personaHint.avgDuration') },
  get coverage() { return tr('siteRest.metrics.personaHint.coverage') },
  get freshness() { return tr('siteRest.metrics.personaHint.freshness') },
  get entities() { return tr('siteRest.metrics.personaHint.entities') },
}

export const TRIGGER_TYPES: Record<string, { readonly label: string; readonly hint: string }> = {
  regex: {
    get label() { return tr('siteRest.metrics.triggerType.regex.label') },
    get hint() { return tr('siteRest.metrics.triggerType.regex.hint') },
  },
  file_glob: {
    get label() { return tr('siteRest.metrics.triggerType.fileGlob.label') },
    get hint() { return tr('siteRest.metrics.triggerType.fileGlob.hint') },
  },
  semantic: {
    get label() { return tr('siteRest.metrics.triggerType.semantic.label') },
    get hint() { return tr('siteRest.metrics.triggerType.semantic.hint') },
  },
  mcp_action: {
    get label() { return tr('siteRest.metrics.triggerType.mcpAction.label') },
    get hint() { return tr('siteRest.metrics.triggerType.mcpAction.hint') },
  },
}

/** `#a #b #c +2` for a meta line. */
export function tagSummary(tags: string[], max = 3): string | null {
  if (tags.length === 0) return null
  const shown = tags.slice(0, max).map((t) => `#${t}`).join(' ')
  return tags.length > max ? `${shown} +${tags.length - max}` : shown
}
