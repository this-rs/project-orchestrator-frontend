import type { ProviderRoutingMode } from '@/types/routing'

/**
 * What a new conversation may run on, as the menu builds it: a set of
 * (provider, model) picks plus the Auto switch. The MODE is not stored - it is
 * read from that state: Auto -> `full`, one pick -> `primary` (strict), several
 * -> `mixed`, none -> the settings decide (or the server default once Auto is off).
 */
export interface RoutingPick {
  provider: string
  /** A model id, or the NAME of an alias of that provider. */
  model: string
}

export const pickKey = (p: RoutingPick) => `${p.provider}\u0000${p.model}`

export const isPicked = (selection: readonly RoutingPick[], p: RoutingPick) => selection.some((s) => pickKey(s) === pickKey(p))

/** Add the pick when absent, remove it when present. */
export function togglePick(selection: readonly RoutingPick[], p: RoutingPick): RoutingPick[] {
  return isPicked(selection, p) ? selection.filter((s) => pickKey(s) !== pickKey(p)) : [...selection, p]
}

/** Every pick of `provider` set to `on`, the others untouched. `models` are that provider's ids. */
export function setProviderPicks(selection: readonly RoutingPick[], provider: string, models: readonly string[], on: boolean): RoutingPick[] {
  const others = selection.filter((s) => s.provider !== provider)
  return on ? [...others, ...models.map((model) => ({ provider, model }))] : others
}

/** How much of a provider is picked: nothing, some of it, all of it. */
export function providerState(selection: readonly RoutingPick[], provider: string, models: readonly string[]): 'none' | 'some' | 'all' {
  const picked = models.filter((model) => isPicked(selection, { provider, model })).length
  if (picked === 0) return 'none'
  return picked === models.length ? 'all' : 'some'
}

/**
 * The routing mode a draft stands for. `null` = the user touched nothing that
 * says anything (no Auto choice, no pick): the settings decide. `resolve` names
 * the model a pick stands for (an alias and its model are ONE model).
 */
export function modeOf(auto: boolean | null, selection: readonly RoutingPick[], resolve: (p: RoutingPick) => string = (p) => p.model): ProviderRoutingMode | null {
  if (auto) return 'full'
  const count = distinctModels(selection, resolve).length
  if (count >= 2) return 'mixed'
  if (count === 1) return 'primary'
  // Auto was switched OFF and nothing picked yet: not Auto, so no routing; the server default runs.
  return auto === false ? 'primary' : null
}

/** Two picks of the same model under another name count once (an alias and its model). */
export function distinctModels(selection: readonly RoutingPick[], resolve: (p: RoutingPick) => string): RoutingPick[] {
  const seen = new Set<string>()
  return selection.filter((p) => {
    const k = `${p.provider}\u0000${resolve(p)}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
