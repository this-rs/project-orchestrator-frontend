// ============================================================================
// Model presentation layer
//
// The catalog itself is NOT defined here. It is served by the backend
// (`GET /api/chat/models`, see backend/src/chat/model_catalog.rs) and held in
// `modelCatalogAtom`. This module only turns a backend-supplied model into
// pixels: colors, grouping, and label fallbacks.
//
// Why colors live here and not in the API payload: Tailwind v4 runs with no
// config and no safelist, so a utility class is only emitted when it appears
// verbatim in a scanned source file. A class arriving over the wire from a
// Rust file would be purged from the production bundle — silently, with no
// build error and no failing test. Every class below is therefore a literal.
// ============================================================================

export type ModelFamily = 'opus' | 'fable' | 'sonnet' | 'haiku' | 'mythos' | 'other'
export type ModelTier = 'current' | 'legacy'

/** A selectable model, as served by the backend catalog. */
export interface ModelDefinition {
  /** Official Anthropic API model ID (e.g. "claude-sonnet-5") */
  id: string
  /** Model family, lowercase */
  family: ModelFamily
  /** Version as displayed, e.g. "5.5". May be empty. */
  version: string
  /** Whether the model is in the active lineup or kept for compatibility */
  tier: ModelTier
  /** Short display label for compact UI (e.g. "Sonnet 5") */
  shortLabel: string
  /** Full marketing name (e.g. "Claude Sonnet 5") */
  fullLabel: string
  /** One-line description for selection cards (may be empty when uncurated) */
  description: string
}

/**
 * Last-resort default model ID.
 *
 * Only reached when the backend advertises no `default_model`
 * (see `ChatInput`: `sessionModel ?? serverConfig?.default_model ?? DEFAULT_MODEL_ID`).
 * Keep in sync with `ChatConfig::default_model` in backend/src/chat/config.rs.
 */
export const DEFAULT_MODEL_ID = 'claude-sonnet-5'

// ============================================================================
// Family presentation
// ============================================================================

const FAMILIES: readonly ModelFamily[] = ['opus', 'fable', 'sonnet', 'haiku', 'mythos', 'other']

/** Display order of family groups in the selector. */
export const FAMILY_ORDER: readonly ModelFamily[] = FAMILIES

export const FAMILY_LABEL: Record<ModelFamily, string> = {
  opus: 'Opus',
  fable: 'Fable',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
  mythos: 'Mythos',
  other: 'Other',
}

/**
 * Family → Tailwind dot color.
 *
 * Every value MUST be a literal class string (see the module header).
 * Never build one by interpolation.
 */
const FAMILY_DOT_COLOR: Record<ModelFamily, string> = {
  opus: 'bg-violet-500',
  fable: 'bg-rose-500',
  sonnet: 'bg-blue-500',
  haiku: 'bg-emerald-400',
  mythos: 'bg-amber-500',
  other: 'bg-slate-400',
}

/** Narrow an arbitrary backend string to a known family. */
export function asModelFamily(value: string | undefined): ModelFamily {
  return FAMILIES.includes(value as ModelFamily) ? (value as ModelFamily) : 'other'
}

/** Tailwind dot color for a family. */
export function getFamilyDotColor(family: string | undefined): string {
  return FAMILY_DOT_COLOR[asModelFamily(family)]
}

// ============================================================================
// Fallbacks for a bare model ID
//
// Used where only an ID is available and the catalog entry is not at hand —
// e.g. a model recorded on an old chat session that no longer exists in the
// live catalog. These mirror `derive_family_version` / `compose_short_label`
// in backend/src/chat/model_catalog.rs.
// ============================================================================

/** `"claude-opus-5-5"` → `"opus"`; unknown families → `"other"`. */
export function parseModelFamily(modelId: string): ModelFamily {
  const parts = modelId.replace(/^claude-/, '').split('-')
  return asModelFamily(FAMILIES.find((f) => parts.some((p) => p.toLowerCase() === f)))
}

/**
 * `"claude-opus-5-5"` → `"Opus 5.5"`.
 *
 * Trailing numeric segments are joined with dots; anything before them is
 * capitalized. Produces the same label the backend curates for every current
 * model ID, so it stays correct without carrying a copy of the catalog.
 */
export function getModelShortLabel(modelId: string): string {
  const parts = modelId.replace(/^claude-/, '').split('-')

  const numParts: string[] = []
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^\d+$/.test(parts[i])) numParts.unshift(parts[i])
    else break
  }

  const textParts = parts
    .slice(0, parts.length - numParts.length)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))

  const label = [...textParts, numParts.join('.')].filter(Boolean).join(' ')
  return label || modelId
}

/** Tailwind dot color inferred from a bare model ID. */
export function getModelDotColor(modelId: string): string {
  return FAMILY_DOT_COLOR[parseModelFamily(modelId)]
}

// ============================================================================
// Grouping
// ============================================================================

export interface ModelFamilyGroup {
  family: ModelFamily
  label: string
  dotColor: string
  models: ModelDefinition[]
}

/**
 * Group a catalog into family sections, in `FAMILY_ORDER`, preserving the
 * backend's ordering within each family (current lineup before legacy).
 * Empty families are omitted.
 */
export function groupModelsByFamily(models: readonly ModelDefinition[]): ModelFamilyGroup[] {
  return FAMILY_ORDER.map((family) => ({
    family,
    label: FAMILY_LABEL[family],
    dotColor: FAMILY_DOT_COLOR[family],
    models: models.filter((m) => asModelFamily(m.family) === family),
  })).filter((g) => g.models.length > 0)
}

// ============================================================================
// Versions within a family
// ============================================================================

/**
 * Compare two display versions numerically, segment by segment:
 * "4.10" > "4.9", "5" < "5.5". Non-numeric segments compare as 0.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** A family's models ordered oldest → newest, the natural direction of a slider. */
export function sortByVersionAscending(models: readonly ModelDefinition[]): ModelDefinition[] {
  return [...models].sort((a, b) => compareVersions(a.version, b.version))
}

/**
 * Which version a family's slider should show when the picker opens.
 *
 * The active model if it belongs to this family; otherwise the family's
 * current-lineup model (the one Anthropic recommends), falling back to the
 * newest version when the family has no current model at all.
 */
export function defaultModelForFamily(
  models: readonly ModelDefinition[],
  activeModelId: string,
): ModelDefinition | undefined {
  if (models.length === 0) return undefined
  const active = models.find((m) => m.id === activeModelId)
  if (active) return active
  const ascending = sortByVersionAscending(models)
  const current = ascending.filter((m) => m.tier === 'current')
  const pool = current.length > 0 ? current : ascending
  return pool[pool.length - 1]
}
