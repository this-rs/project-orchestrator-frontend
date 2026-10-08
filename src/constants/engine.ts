// ============================================================================
// ENGINE — why a feature is missing from a session, in three honest causes
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
// - `model`    — a real limit of the model or provider, as its capabilities
//   declare it (`images: false`…).
// - `unprobed` — not measured yet (`context_window: null`). Unknown is not
//   missing: never read as "no long context".
//
// A capability that is present yields nothing at all.

import type { MessageKey } from '@/i18n'
import type { ProviderCapabilities } from '@/types/provider'

export type DegradationCause = 'harness' | 'model' | 'unprobed'

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
 * Degraded ids that the backend derives from a capability of the session. When
 * that capability is declared present, the engine is the one missing it.
 */
const CAPABILITY_OF: Readonly<Record<string, keyof ProviderCapabilities>> = {
  images: 'images',
  tools: 'tools',
  compaction: 'compaction_signal',
  project_orchestrator_tools: 'per_session_mcp',
}

const CAUSE_ORDER: readonly DegradationCause[] = ['harness', 'model', 'unprobed']

/** A positive context window size is declared. */
function contextWindowKnown(declared: DeclaredCapabilities | null | undefined): boolean {
  const cw = declared?.context_window
  if (cw === null || typeof cw !== 'object') return false
  const value = (cw as { value?: unknown }).value
  return typeof value === 'number' && value > 0
}

/** `context_window` declared, and declared unknown. Absent from the declaration = nothing said. */
function contextWindowUnprobed(declared: DeclaredCapabilities | null | undefined): boolean {
  if (!declared || !('context_window' in declared)) return false
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

const MODEL_KEYS: Readonly<Record<string, MessageKey>> = {
  images: 'session.model.images',
  tools: 'session.model.tools',
  compaction: 'session.model.compaction',
  project_orchestrator_tools: 'session.model.project_orchestrator_tools',
}

/** `brand_new_thing` → `brand new thing`: an unknown id stays visible, never hidden. */
export function humanizeFeature(id: string): string {
  return id.replace(/[_-]+/g, ' ').trim()
}

/** The sentence of one item, as an i18n key and its variables. */
export function degradationMessage(item: Degradation): { key: MessageKey; vars?: Record<string, string> } {
  if (item.cause === 'unprobed') return { key: 'session.unprobed.context_window' }
  const known = (item.cause === 'model' ? MODEL_KEYS : HARNESS_KEYS)[item.id]
  if (known) return { key: known }
  return { key: 'session.harness.unknown', vars: { feature: humanizeFeature(item.id) } }
}

/** Heading and note of each cause. */
export const CAUSE_KEYS: Readonly<Record<DegradationCause, { heading: MessageKey; note: MessageKey }>> = {
  harness: { heading: 'session.degradation.harness.heading', note: 'session.degradation.harness.note' },
  model: { heading: 'session.degradation.model.heading', note: 'session.degradation.model.note' },
  unprobed: { heading: 'session.degradation.unprobed.heading', note: 'session.degradation.unprobed.note' },
}
