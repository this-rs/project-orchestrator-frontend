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

// ── Plain-French explanations ───────────────────────────────────────────

export const SKILL_HINTS = {
  energy: "Activité récente de ses notes : haute = sujet travaillé en ce moment, basse = sujet qui s'endort.",
  cohesion: 'Solidité du groupe : fort = notes et décisions très liées entre elles, sujet bien délimité.',
  hitRate: "Part des activations qui ont réellement servi à l'agent.",
  activations: "Nombre de fois où le skill a été injecté dans le contexte d'un agent.",
  coverage: 'Taille du groupe détecté dans le graphe de connaissances (nombre d’éléments).',
  members: 'Notes et décisions qui composent ce skill — le savoir qu’il transmet.',
} as const

export const PERSONA_HINTS = {
  energy: "Vitalité : renforcée quand ses tâches réussissent, diminue en cas d'échec ou d'inactivité.",
  cohesion: 'À quel point ce qu’elle connaît forme un ensemble cohérent et relié.',
  successRate: 'Part des tâches réussies quand un agent utilisait cette persona.',
  activations: 'Nombre de fois où elle a été chargée pour exécuter une tâche.',
  avgDuration: 'Durée moyenne d’une tâche exécutée avec elle.',
  coverage: 'Part du projet couverte par ce qu’elle connaît.',
  freshness: 'Récence moyenne de ses connaissances : bas = savoir à relire.',
  entities: 'Nombre total de fichiers, notes, décisions, skills… auxquels elle est reliée.',
} as const

export const TRIGGER_TYPES: Record<string, { label: string; hint: string }> = {
  regex: { label: 'Regex', hint: 'Expression régulière testée sur le texte de la requête.' },
  file_glob: { label: 'File glob', hint: 'S’active quand l’agent touche des fichiers correspondant au motif.' },
  semantic: { label: 'Semantic', hint: 'S’active quand la requête parle du même sujet (proximité de sens).' },
  mcp_action: { label: 'MCP action', hint: 'S’active sur un appel d’outil MCP précis (ex. note:create).' },
}

/** `#a #b #c +2` for a meta line. */
export function tagSummary(tags: string[], max = 3): string | null {
  if (tags.length === 0) return null
  const shown = tags.slice(0, max).map((t) => `#${t}`).join(' ')
  return tags.length > max ? `${shown} +${tags.length - max}` : shown
}
