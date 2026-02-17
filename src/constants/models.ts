// ============================================================================
// Model definitions — single source of truth for all LLM model references
// ============================================================================

/** Definition of a selectable model in the UI */
export interface ModelDefinition {
  /** Official Anthropic API model ID (e.g. "claude-sonnet-4-6") */
  id: string
  /** Short display label for compact UI (e.g. "Sonnet 4.6") */
  shortLabel: string
  /** Full marketing name (e.g. "Claude Sonnet 4.6") */
  fullLabel: string
  /** Tailwind dot color class (e.g. "bg-blue-400") */
  dotColor: string
  /** One-line description for selection cards */
  description: string
}

/**
 * Available models for selection in the UI.
 *
 * To add a new model, add an entry here — all UI components (ChatInput,
 * ChatPage, ModelChangedBlock, etc.) will pick it up automatically.
 */
export const AVAILABLE_MODELS: readonly ModelDefinition[] = [
  {
    id: 'claude-opus-4-6',
    shortLabel: 'Opus 4.6',
    fullLabel: 'Claude Opus 4.6',
    dotColor: 'bg-violet-400',
    description: 'Most intelligent — complex reasoning',
  },
  {
    id: 'claude-sonnet-4-6',
    shortLabel: 'Sonnet 4.6',
    fullLabel: 'Claude Sonnet 4.6',
    dotColor: 'bg-blue-400',
    description: 'Fast & capable — best for most tasks',
  },
  {
    id: 'claude-haiku-4-5',
    shortLabel: 'Haiku 4.5',
    fullLabel: 'Claude Haiku 4.5',
    dotColor: 'bg-emerald-400',
    description: 'Fastest — lightweight tasks',
  },
] as const

/** Default model ID used when no override is set */
export const DEFAULT_MODEL_ID = 'claude-sonnet-4-6'

// ============================================================================
// Lookup helpers — graceful fallback for unknown model IDs
// ============================================================================

/** Lookup map for O(1) access */
const modelById = new Map(AVAILABLE_MODELS.map((m) => [m.id, m]))

/**
 * Extract a human-readable short label from a model ID.
 *
 * For known models, returns the curated shortLabel (e.g. "Sonnet 4.6").
 * For unknown models, parses the ID to produce a sensible fallback
 * (e.g. "claude-foo-bar-7" → "Foo Bar 7").
 */
export function getModelShortLabel(modelId: string): string {
  const known = modelById.get(modelId)
  if (known) return known.shortLabel

  // Fallback: parse model ID into readable label
  // "claude-sonnet-4-5" → "Sonnet 4 5" → "Sonnet 4.5"
  const withoutPrefix = modelId.replace(/^claude-/, '')
  // Split by hyphens, capitalize first letter of each segment
  const parts = withoutPrefix.split('-')

  // Heuristic: group trailing numeric segments with dots (e.g. "4-6" → "4.6")
  const textParts: string[] = []
  const numParts: string[] = []
  let inNumbers = false
  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      inNumbers = true
      numParts.push(part)
    } else {
      if (inNumbers) {
        textParts.push(numParts.join('.'))
        numParts.length = 0
        inNumbers = false
      }
      textParts.push(part.charAt(0).toUpperCase() + part.slice(1))
    }
  }
  if (numParts.length > 0) {
    textParts.push(numParts.join('.'))
  }

  return textParts.join(' ') || modelId
}

/**
 * Get the Tailwind dot color class for a model.
 *
 * Known models return their curated color. Unknown models get a
 * family-based heuristic (opus=violet, haiku=emerald, default=blue).
 */
export function getModelDotColor(modelId: string): string {
  const known = modelById.get(modelId)
  if (known) return known.dotColor

  // Family-based fallback
  if (modelId.includes('opus')) return 'bg-violet-400'
  if (modelId.includes('haiku')) return 'bg-emerald-400'
  return 'bg-blue-400' // sonnet / default
}

/**
 * Get the description for a model (empty string for unknown models).
 */
export function getModelDescription(modelId: string): string {
  return modelById.get(modelId)?.description ?? ''
}
