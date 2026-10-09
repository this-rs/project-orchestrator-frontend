import { activeTranslator } from '@/i18n/active'
import type { MessageKey } from '@/i18n/catalog'

/**
 * Glossary of technical terms used in the Project Orchestrator.
 * Each entry provides a human-readable label and a plain-language description.
 * The words live in `src/i18n` (`glossary.<term>.*`) and are read when used, so they follow the language.
 */

export interface GlossaryEntry {
  /** Display label */
  label: string
  /** Plain-language explanation */
  description: string
}

const tr = (key: MessageKey): string => activeTranslator().t(key)

export const glossary: Record<string, GlossaryEntry> = {
  energy: {
    get label() {
      return tr('glossary.energy.label')
    },
    get description() {
      return tr('glossary.energy.description')
    },
  },
  cohesion: {
    get label() {
      return tr('glossary.cohesion.label')
    },
    get description() {
      return tr('glossary.cohesion.description')
    },
  },
  synapse: {
    get label() {
      return tr('glossary.synapse.label')
    },
    get description() {
      return tr('glossary.synapse.description')
    },
  },
  scar: {
    get label() {
      return tr('glossary.scar.label')
    },
    get description() {
      return tr('glossary.scar.description')
    },
  },
  moat: {
    get label() {
      return tr('glossary.moat.label')
    },
    get description() {
      return tr('glossary.moat.description')
    },
  },
  spreading_activation: {
    get label() {
      return tr('glossary.spreading_activation.label')
    },
    get description() {
      return tr('glossary.spreading_activation.description')
    },
  },
  fabric: {
    get label() {
      return tr('glossary.fabric.label')
    },
    get description() {
      return tr('glossary.fabric.description')
    },
  },
  trajectory: {
    get label() {
      return tr('glossary.trajectory.label')
    },
    get description() {
      return tr('glossary.trajectory.description')
    },
  },
  protocol: {
    get label() {
      return tr('glossary.protocol.label')
    },
    get description() {
      return tr('glossary.protocol.description')
    },
  },
  persona: {
    get label() {
      return tr('glossary.persona.label')
    },
    get description() {
      return tr('glossary.persona.description')
    },
  },
  episode: {
    get label() {
      return tr('glossary.episode.label')
    },
    get description() {
      return tr('glossary.episode.description')
    },
  },
  neural_routing: {
    get label() {
      return tr('glossary.neural_routing.label')
    },
    get description() {
      return tr('glossary.neural_routing.description')
    },
  },
  milestone: {
    get label() {
      return tr('glossary.milestone.label')
    },
    get description() {
      return tr('glossary.milestone.description')
    },
  },
  feature_graph: {
    get label() {
      return tr('glossary.feature_graph.label')
    },
    get description() {
      return tr('glossary.feature_graph.description')
    },
  },
  lifecycle_hook: {
    get label() {
      return tr('glossary.lifecycle_hook.label')
    },
    get description() {
      return tr('glossary.lifecycle_hook.description')
    },
  },
  constraint: {
    get label() {
      return tr('glossary.constraint.label')
    },
    get description() {
      return tr('glossary.constraint.description')
    },
  },
  decision: {
    get label() {
      return tr('glossary.decision.label')
    },
    get description() {
      return tr('glossary.decision.description')
    },
  },
  component: {
    get label() {
      return tr('glossary.component.label')
    },
    get description() {
      return tr('glossary.component.description')
    },
  },
  workspace: {
    get label() {
      return tr('glossary.workspace.label')
    },
    get description() {
      return tr('glossary.workspace.description')
    },
  },
  skill: {
    get label() {
      return tr('glossary.skill.label')
    },
    get description() {
      return tr('glossary.skill.description')
    },
  },
  release: {
    get label() {
      return tr('glossary.release.label')
    },
    get description() {
      return tr('glossary.release.description')
    },
  },
  success_rate: {
    get label() {
      return tr('glossary.success_rate.label')
    },
    get description() {
      return tr('glossary.success_rate.description')
    },
  },
  activation_count: {
    get label() {
      return tr('glossary.activation_count.label')
    },
    get description() {
      return tr('glossary.activation_count.description')
    },
  },
  analysis_profile: {
    get label() {
      return tr('glossary.analysis_profile.label')
    },
    get description() {
      return tr('glossary.analysis_profile.description')
    },
  },
  co_change: {
    get label() {
      return tr('glossary.co_change.label')
    },
    get description() {
      return tr('glossary.co_change.description')
    },
  },
  coupling: {
    get label() {
      return tr('glossary.coupling.label')
    },
    get description() {
      return tr('glossary.coupling.description')
    },
  },
  churn: {
    get label() {
      return tr('glossary.churn.label')
    },
    get description() {
      return tr('glossary.churn.description')
    },
  },
  hotspot: {
    get label() {
      return tr('glossary.hotspot.label')
    },
    get description() {
      return tr('glossary.hotspot.description')
    },
  },
  orphan: {
    get label() {
      return tr('glossary.orphan.label')
    },
    get description() {
      return tr('glossary.orphan.description')
    },
  },
  dead_note: {
    get label() {
      return tr('glossary.dead_note.label')
    },
    get description() {
      return tr('glossary.dead_note.description')
    },
  },
  stale_note: {
    get label() {
      return tr('glossary.stale_note.label')
    },
    get description() {
      return tr('glossary.stale_note.description')
    },
  },
  god_function: {
    get label() {
      return tr('glossary.god_function.label')
    },
    get description() {
      return tr('glossary.god_function.description')
    },
  },
  clustering_coefficient: {
    get label() {
      return tr('glossary.clustering_coefficient.label')
    },
    get description() {
      return tr('glossary.clustering_coefficient.description')
    },
  },
  knowledge_coverage: {
    get label() {
      return tr('glossary.knowledge_coverage.label')
    },
    get description() {
      return tr('glossary.knowledge_coverage.description')
    },
  },
  note_freshness: {
    get label() {
      return tr('glossary.note_freshness.label')
    },
    get description() {
      return tr('glossary.note_freshness.description')
    },
  },
  synapse_quality: {
    get label() {
      return tr('glossary.synapse_quality.label')
    },
    get description() {
      return tr('glossary.synapse_quality.description')
    },
  },
  skills_maturity: {
    get label() {
      return tr('glossary.skills_maturity.label')
    },
    get description() {
      return tr('glossary.skills_maturity.description')
    },
  },
  code_safety: {
    get label() {
      return tr('glossary.code_safety.label')
    },
    get description() {
      return tr('glossary.code_safety.description')
    },
  },
  health_score: {
    get label() {
      return tr('glossary.health_score.label')
    },
    get description() {
      return tr('glossary.health_score.description')
    },
  },
  circular_dependency: {
    get label() {
      return tr('glossary.circular_dependency.label')
    },
    get description() {
      return tr('glossary.circular_dependency.description')
    },
  },
}

/** Get a glossary entry by key, or undefined if not found */
export function getGlossaryEntry(term: string): GlossaryEntry | undefined {
  return glossary[term.toLowerCase().replace(/[\s-]/g, '_')]
}

/** All glossary term keys */
export type GlossaryTerm = keyof typeof glossary
