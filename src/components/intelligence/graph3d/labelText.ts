// ============================================================================
// labelText — the words the 3D graph writes on its own labels
// ============================================================================
//
// Group names, counts and the whole-graph root are built OUTSIDE React (a THREE
// sprite text, a pure cut of the cluster tree), so they cannot call `useT()`.
// They read the language on screen through `activeTranslator()` instead, at the
// moment the label is built. A label already on screen keeps its language until
// the graph is rebuilt — the same rule as every other pure formatter.
// ============================================================================

import { activeTranslator, type MessageKey } from '@/i18n'

/** Entity type → the key of its plural noun in `intelGraph.labels.kind`. Typed, so a missing key fails `tsc`. */
const KIND_KEYS: Readonly<Record<string, MessageKey>> = {
  file: 'intelGraph.labels.kind.file',
  function: 'intelGraph.labels.kind.function',
  struct: 'intelGraph.labels.kind.struct',
  trait: 'intelGraph.labels.kind.trait',
  enum: 'intelGraph.labels.kind.enum',
  note: 'intelGraph.labels.kind.note',
  decision: 'intelGraph.labels.kind.decision',
  constraint: 'intelGraph.labels.kind.constraint',
  plan: 'intelGraph.labels.kind.plan',
  task: 'intelGraph.labels.kind.task',
  step: 'intelGraph.labels.kind.step',
  milestone: 'intelGraph.labels.kind.milestone',
  release: 'intelGraph.labels.kind.release',
  commit: 'intelGraph.labels.kind.commit',
  skill: 'intelGraph.labels.kind.skill',
  protocol: 'intelGraph.labels.kind.protocol',
  protocol_state: 'intelGraph.labels.kind.protocol_state',
  chat_session: 'intelGraph.labels.kind.chat_session',
  feature_graph: 'intelGraph.labels.kind.feature_graph',
}

/** Name of a group that has no name of its own. */
export function groupLabel(): string {
  return activeTranslator().t('intelGraph.labels.group')
}

/** Name of the root: the whole graph, seen from far away. */
export function wholeGraphLabel(): string {
  return activeTranslator().t('intelGraph.labels.whole')
}

/** Name of a layer group. */
export function layerLabel(layer: string): string {
  return activeTranslator().t('intelGraph.labels.layer', { layer })
}

/** Suffix of a part of a community that was split. */
export function partLabel(): string {
  return activeTranslator().t('intelGraph.labels.part')
}

/** Fallback name of a community that has no label: « Communauté 3 » / « Community 3 ». */
export function communityFallbackLabel(id: number | string): string {
  return activeTranslator().t('intelGraph.communityFallback', { id: String(id) })
}

/** Is `name` one of the generic names a group gets when it has no real one? */
export function isGenericGroupName(name: string): boolean {
  if (!name || name === groupLabel()) return true
  // a community named by its fallback, in any language the page has been shown in
  return /^(Communaut[ée]|Community)\s+\d+$/i.test(name)
}

/** `{count} {kind}` — « 168 fichiers » / « 168 files ». Unknown kinds keep their raw name. */
export function membersLabel(count: number, entityType: string): string {
  const t = activeTranslator()
  const key = KIND_KEYS[entityType]
  const kind = key ? t.t(key) : entityType
  return t.t('intelGraph.labels.members', { count: t.number(count), kind })
}
