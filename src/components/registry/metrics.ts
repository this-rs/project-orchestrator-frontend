/**
 * Qualitative levels and plain-French explanations for the Skills &
 * Personas metrics (data only — components live in concepts.tsx).
 */
import type { StatusTone } from '@/components/ui'

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
  if (v >= 0.7) return { label: 'High', tone: 'success' }
  if (v >= 0.3) return { label: 'Medium', tone: 'warning' }
  return { label: 'Low', tone: 'danger' }
}

/** Cohesion — strong ≥ 0.5 (historical threshold). */
export function cohesionLevel(v: number): Level {
  if (v >= 0.5) return { label: 'Strong', tone: 'progress' }
  return { label: 'Weak', tone: 'neutral' }
}

/** Generic ratio (hit rate, success rate, coverage, freshness). */
export function ratioLevel(v: number): Level {
  if (v >= 0.7) return { label: 'Good', tone: 'success' }
  if (v >= 0.4) return { label: 'Fair', tone: 'warning' }
  return { label: 'Poor', tone: 'danger' }
}

// ── Plain-language explanations ───────────────────────────────────────────

export const SKILL_HINTS = {
  energy: 'Recent activity of its notes: high = topic being worked on right now, low = topic going quiet.',
  cohesion: 'Strength of the group: high = notes and decisions tightly linked to each other, a well-delimited topic.',
  hitRate: 'Share of activations that actually helped the agent.',
  activations: "Number of times the skill was injected into an agent's context.",
  coverage: 'Size of the group detected in the knowledge graph (number of elements).',
  members: 'Notes and decisions that make up this skill — the knowledge it passes on.',
} as const

export const PERSONA_HINTS = {
  energy: 'Vitality: reinforced when its tasks succeed, drops on failure or inactivity.',
  cohesion: 'How much what it knows forms a coherent, connected whole.',
  successRate: 'Share of tasks that succeeded while an agent used this persona.',
  activations: 'Number of times it was loaded to run a task.',
  avgDuration: 'Average duration of a task run with it.',
  coverage: 'Share of the project covered by what it knows.',
  freshness: 'Average recency of its knowledge: low = knowledge to re-read.',
  entities: 'Total number of files, notes, decisions, skills… it is linked to.',
} as const

export const TRIGGER_TYPES: Record<string, { label: string; hint: string }> = {
  regex: { label: 'Regex', hint: 'Regular expression tested against the request text.' },
  file_glob: { label: 'File glob', hint: 'Fires when the agent touches files matching the pattern.' },
  semantic: { label: 'Semantic', hint: 'Fires when the request is about the same topic (semantic proximity).' },
  mcp_action: { label: 'MCP action', hint: 'Fires on a specific MCP tool call (e.g. note:create).' },
}

/** `#a #b #c +2` for a meta line. */
export function tagSummary(tags: string[], max = 3): string | null {
  if (tags.length === 0) return null
  const shown = tags.slice(0, max).map((t) => `#${t}`).join(' ')
  return tags.length > max ? `${shown} +${tags.length - max}` : shown
}
