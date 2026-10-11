// ============================================================================
// ENGINE — why a feature is missing from a session, in four honest causes
// ============================================================================
//
// With `CHAT_PROVIDER_PATH=agent` the session runs on the nexus engine. The
// server lists what is missing in `system_init.degraded_features`; the session's
// `capabilities` say what the model itself can do. Those are different stories
// and the interface must not mix them up:
//
// - `harness`  — Project Orchestrator's engine has not ported it yet (message
//   queue, auto-continue, NATS, enrichment, hooks…). Our gap, in progress; not a
//   limit of the model.
// - `installation` — something this server installation lacks and the operator
//   can fix (`nexus_tools`: the `nexus-tools` executable was not found, so a
//   native session has no Bash/Read/Edit/WebFetch). Not a gap in our engine,
//   not a limit of the model: the text says what to install.
// - `model`    — a real limit of the model or provider, as its capabilities
//   declare it (`images: false`…).
// - `unprobed` — not measured yet (`context_window: null`). Unknown is not
//   missing: never read as "no long context".
//
// A capability that is present yields nothing at all.

import type { MessageKey } from '@/i18n'
import type { ProviderCapabilities } from '@/types/provider'

export type DegradationCause = 'harness' | 'installation' | 'model' | 'unprobed'

export interface Degradation {
  /** Feature id (`message_queue`, `images`, `context_window`…). */
  id: string
  cause: DegradationCause
}

/** Capabilities as the last `system_init` declared them (raw: any key may be absent). */
export type DeclaredCapabilities = Partial<Record<keyof ProviderCapabilities, unknown>>

/** Features the engine itself carries (or not yet): never a limit of the model. */
export const HARNESS_FEATURES: readonly string[] = ['message_queue', 'auto_continue', 'nats', 'enrichment', 'hooks', 'retry']

/**
 * Features missing because of the server installation, not of the engine or the
 * model (backend #637: `nexus_tools` is declared only when the executable is
 * really missing or not runnable).
 */
export const INSTALLATION_FEATURES: readonly string[] = ['nexus_tools']

/**
 * Degraded ids that the backend derives from a capability of the session. When
 * that capability is declared present, the engine is the one missing it.
 */
const CAPABILITY_OF: Readonly<Record<string, keyof ProviderCapabilities>> = {
  images: 'images',
  tools: 'tools',
  compaction: 'compaction_signal',
  project_orchestrator_tools: 'per_session_mcp',
}

export const CAUSE_ORDER: readonly DegradationCause[] = ['installation', 'harness', 'model', 'unprobed']

/**
 * F-R4 — what the routing candidates make of `images`, as degraded ids (cause `model`: a limit of
 * the models within reach, never our engine's gap):
 * - `routing_images` — PO routes and none of its candidates reads images;
 * - `images_pool_unbuilt` — PO routes but its pool is not built yet: the opening model's limit
 *   stands, said with its cause (not probed is not absent).
 */
export const ROUTING_IMAGES = 'routing_images'
export const IMAGES_POOL_UNBUILT = 'images_pool_unbuilt'
const ROUTING_FEATURES: readonly string[] = [ROUTING_IMAGES, IMAGES_POOL_UNBUILT]

/** The effective `images` fact of a session (`ChatSession.effective_capabilities.images`), as far as this module needs it. */
export interface EffectiveImagesFact {
  images: { value: boolean; source: 'snapshot' | 'routing_pool'; cause: string }
}

/**
 * The engine's list and the declared capabilities, with `images` read from the routing candidates
 * when PO routes (F-R4, decision 11cefdb2). The banner then never says "this model does not accept
 * images" when PO can route the turn to a model that does:
 * - routing pool, a candidate reads images → no `images` line at all;
 * - routing pool, none does → `routing_images` (the pool's limit, honestly said);
 * - snapshot because the pool is not built → `images_pool_unbuilt` in place of the model's line;
 * - otherwise (no routing, no router, the model reads images) → unchanged.
 * Returns the very same arrays/objects when nothing changes.
 */
export function withEffectiveImages(
  degraded: readonly string[],
  declared: DeclaredCapabilities | null | undefined,
  effective: EffectiveImagesFact | null | undefined,
): { degraded: readonly string[]; declared: DeclaredCapabilities | null | undefined } {
  const images = effective?.images
  if (!images) return { degraded, declared }
  const lacking = images.source === 'routing_pool' ? (images.value ? null : ROUTING_IMAGES) : images.cause === 'pool_unbuilt' && !images.value ? IMAGES_POOL_UNBUILT : undefined
  if (lacking === undefined) return { degraded, declared }
  // `images` declared present so the declared limit adds no line of its own: the effective fact speaks.
  const rest = degraded.filter((id) => id !== 'images' && id !== ROUTING_IMAGES && id !== IMAGES_POOL_UNBUILT)
  return { degraded: lacking ? [...rest, lacking] : rest, declared: { ...(declared ?? {}), images: true } }
}

/** A positive context window size is declared. */
function contextWindowKnown(declared: DeclaredCapabilities | null | undefined): boolean {
  const cw = declared?.context_window
  if (cw === null || typeof cw !== 'object') return false
  const value = (cw as { value?: unknown }).value
  return typeof value === 'number' && value > 0
}

/**
 * Fields nexus always serialises in a `Capabilities`: a declaration that carries
 * them all is complete, so an absent `context_window` there means unknown (nexus
 * skips the field when it is `None`).
 */
const ALWAYS_SERIALIZED: readonly (keyof ProviderCapabilities)[] = ['tools', 'images', 'resume', 'per_session_mcp']

/**
 * `context_window` declared unknown: `null`, no positive size, or left out of a
 * complete declaration. Left out of a partial declaration = nothing said.
 */
function contextWindowUnprobed(declared: DeclaredCapabilities | null | undefined): boolean {
  if (!declared) return false
  if (!('context_window' in declared) || declared.context_window === undefined) {
    return ALWAYS_SERIALIZED.every((field) => field in declared)
  }
  return !contextWindowKnown(declared)
}

/**
 * Sorts what a session cannot do by cause. `degraded` is the engine's list,
 * `declared` the capabilities of the same `system_init`.
 */
export function classifyDegradations(
  degraded: readonly string[],
  declared?: DeclaredCapabilities | null,
): Degradation[] {
  const found = new Map<string, DegradationCause>()
  for (const id of degraded) {
    if (id === 'context_window') {
      // Listed by the engine: unprobed unless a size is declared (then nothing is missing).
      if (!contextWindowKnown(declared)) found.set(id, 'unprobed')
      continue
    }
    if (ROUTING_FEATURES.includes(id)) {
      // What the models within PO's reach cannot do (F-R4): a limit, not our gap.
      found.set(id, 'model')
      continue
    }
    if (INSTALLATION_FEATURES.includes(id)) {
      // The operator can fix it: say what to install, not "work in progress".
      found.set(id, 'installation')
      continue
    }
    const capability = CAPABILITY_OF[id]
    if (capability) {
      // The model has it, the engine does not carry it: our gap.
      found.set(id, declared?.[capability] === true ? 'harness' : 'model')
      continue
    }
    // Engine features, known or not: an id the engine sends is about the engine.
    found.set(id, 'harness')
  }
  // Real limits the capabilities declare, even if the engine did not list them.
  if (declared?.images === false && !found.has('images')) found.set('images', 'model')
  if (declared?.tools === false && !found.has('tools')) found.set('tools', 'model')
  if (contextWindowUnprobed(declared) && !found.has('context_window')) found.set('context_window', 'unprobed')

  return [...found]
    .map(([id, cause]) => ({ id, cause }))
    .sort((a, b) => CAUSE_ORDER.indexOf(a.cause) - CAUSE_ORDER.indexOf(b.cause))
}

/**
 * What the capability banner lists for a session: nothing while the engine names no missing
 * feature (the declared limits alone do not raise the banner), the classified list otherwise.
 */
export function engineGaps(degraded: readonly string[], declared?: DeclaredCapabilities | null): Degradation[] {
  return degraded.length === 0 ? [] : classifyDegradations(degraded, declared)
}

const HARNESS_KEYS: Readonly<Record<string, MessageKey>> = {
  hooks: 'session.harness.hooks',
  message_queue: 'session.harness.message_queue',
  auto_continue: 'session.harness.auto_continue',
  retry: 'session.harness.retry',
  compaction: 'session.harness.compaction',
  nats: 'session.harness.nats',
  enrichment: 'session.harness.enrichment',
  images: 'session.harness.images',
  tools: 'session.harness.tools',
}

const INSTALLATION_KEYS: Readonly<Record<string, MessageKey>> = {
  nexus_tools: 'session.installation.nexus_tools',
}

const MODEL_KEYS: Readonly<Record<string, MessageKey>> = {
  images: 'session.model.images',
  tools: 'session.model.tools',
  compaction: 'session.model.compaction',
  project_orchestrator_tools: 'session.model.project_orchestrator_tools',
  [ROUTING_IMAGES]: 'routing.capabilities.banner.poolLacksImages',
  [IMAGES_POOL_UNBUILT]: 'routing.capabilities.banner.imagesPoolUnbuilt',
}

/** `brand_new_thing` → `brand new thing`: an unknown id stays visible, never hidden. */
export function humanizeFeature(id: string): string {
  return id.replace(/[_-]+/g, ' ').trim()
}

/** The sentence of one item, as an i18n key and its variables. */
export function degradationMessage(item: Degradation): { key: MessageKey; vars?: Record<string, string> } {
  if (item.cause === 'unprobed') return { key: 'session.unprobed.context_window' }
  const keys = item.cause === 'model' ? MODEL_KEYS : item.cause === 'installation' ? INSTALLATION_KEYS : HARNESS_KEYS
  const known = keys[item.id]
  if (known) return { key: known }
  return { key: 'session.harness.unknown', vars: { feature: humanizeFeature(item.id) } }
}

/** Heading and note of each cause. */
export const CAUSE_KEYS: Readonly<Record<DegradationCause, { heading: MessageKey; note: MessageKey }>> = {
  installation: { heading: 'session.degradation.installation.heading', note: 'session.degradation.installation.note' },
  harness: { heading: 'session.degradation.harness.heading', note: 'session.degradation.harness.note' },
  model: { heading: 'session.degradation.model.heading', note: 'session.degradation.model.note' },
  unprobed: { heading: 'session.degradation.unprobed.heading', note: 'session.degradation.unprobed.note' },
}
