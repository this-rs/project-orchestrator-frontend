/**
 * `iso_scene` data → a checked machine of the shared 3D engine (`src/vendor/three-iso/`,
 * generated from the site). Part of the LAZY chunk: never imported by the chat's
 * initial bundle.
 *
 * Accepted data (JSON, data only — never code):
 *
 *   1. A scene: stations on a layout, each a library mechanism or a construction tree.
 *        { "title": "Release", "layout": "arch",
 *          "stations": [ { "mech": "dependency-graph", "tone": "violet", "label": "Plan" },
 *                        { "mech": "parallel-lanes",   "tone": "sky",    "label": "Build", "after": [0] },
 *                        { "ast": { "kind": "use", "ref": "flag" }, "tone": "green", "label": "Ship", "after": [1] } ],
 *          "build": { "mode": "sequential" } }
 *   2. One object: a construction tree (`ast`), shown alone on the `solo` layout.
 *        { "title": "Server", "tone": "sky", "ast": { "kind": "group", "children": [ … ] } }
 *   3. The bare tree itself: { "kind": "group", "children": [ … ] }.
 *
 * Unlike the site, a station `label` is free text (≤ 60 characters), shown in the
 * legend; the engine receives a neutral key. `tone` defaults to the palette in order,
 * `layout` to `compact` (no central hole: nothing to frame in a chat) or `solo` for one station. Everything else is checked by the
 * engine's `defineScene` / `checkAst`: a refusal lists what to correct, it never throws.
 */
import { AST_LIMITS, CATALOG } from '@/vendor/three-iso/ast'
import { LAYOUTS } from '@/vendor/three-iso/layouts'
import { LAMP } from '@/vendor/three-iso/iso'
import { MECHANISMS } from '@/vendor/three-iso/mechanisms'
import { defineScene, SceneError, STATION_RANGE, type SceneSpec } from '@/vendor/three-iso/scene'
import type { MachineDef } from '@/vendor/three-iso/machine'

export type ToneName = keyof typeof LAMP

export interface LegendEntry {
  label: string
  tone: ToneName
  color: string
}

export type IsoCompile =
  | { ok: true; machine: MachineDef; title?: string; legend: LegendEntry[] }
  | { ok: false; problems: string[] }

/** Above this many characters of JSON the data is refused before the engine sees it. */
export const MAX_DATA_CHARS = 32_000
const MAX_LABEL = 60
const TONES = Object.keys(LAMP) as ToneName[]
const SCENE_KEYS = new Set(['title', 'caption', 'layout', 'stations', 'angles', 'home', 'stepSeconds', 'build', 'ast', 'tone', 'label'])
const STATION_KEYS = new Set(['mech', 'ast', 'tone', 'label', 'after'])

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** FNV-1a: a stable id per distinct scene (the engine refuses one id used by two different scenes). */
function hash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/** A chat scene has no text to frame: by default the stations sit in a tight serpentine
 * (`compact`), framed on the machine with no empty hole in the middle. A layout the model
 * names explicitly (`arch`, `ring`…) is kept as asked. */
function defaultLayout(n: number): SceneSpec['layout'] {
  if (n <= 1) return 'solo'
  return n <= STATION_RANGE.compact[1] ? 'compact' : 'ring'
}

/** The scene spec the engine checks, plus what the chat shows around it. Problems are input-shape problems only. */
export function toSceneSpec(data: unknown): { spec?: SceneSpec; title?: string; legend: LegendEntry[]; problems: string[] } {
  const problems: string[] = []
  const legend: LegendEntry[] = []
  if (!isObj(data)) return { legend, problems: ['the scene must be a JSON object'] }
  let size = 0
  try {
    size = JSON.stringify(data).length
  } catch {
    return { legend, problems: ['the scene is not plain JSON'] }
  }
  if (size > MAX_DATA_CHARS) return { legend, problems: [`the scene is ${size} characters of JSON (at most ${MAX_DATA_CHARS})`] }

  // A bare tree: { kind: … }.
  const scene: Record<string, unknown> = typeof data.kind === 'string' ? { ast: data } : data
  for (const k of Object.keys(scene)) if (!SCENE_KEYS.has(k)) problems.push(`unknown field « ${k} » (${[...SCENE_KEYS].join(', ')})`)
  const title = typeof scene.title === 'string' ? scene.title.slice(0, 120) : undefined

  let stationsIn: unknown[]
  if (scene.stations !== undefined) {
    if (!Array.isArray(scene.stations)) return { title, legend, problems: [...problems, '« stations » must be an array'] }
    if (scene.ast !== undefined) problems.push('give either « stations » or « ast », not both')
    stationsIn = scene.stations
  } else if (scene.ast !== undefined) {
    stationsIn = [{ ast: scene.ast, tone: scene.tone, label: scene.label ?? title }]
  } else {
    return { title, legend, problems: [...problems, 'nothing to build: give « stations » (a scene) or « ast » (one object)'] }
  }

  const stations = stationsIn.map((raw, i) => {
    if (!isObj(raw)) {
      problems.push(`station ${i + 1}: must be an object`)
      return { tone: TONES[0]!, label: `chat.station.${i + 1}` }
    }
    for (const k of Object.keys(raw)) if (!STATION_KEYS.has(k)) problems.push(`station ${i + 1}: unknown field « ${k} » (${[...STATION_KEYS].join(', ')})`)
    const tone = (raw.tone ?? TONES[i % TONES.length]) as ToneName
    const label = raw.label === undefined ? '' : typeof raw.label === 'string' ? raw.label.trim().slice(0, MAX_LABEL) : (problems.push(`station ${i + 1}: « label » must be text`), '')
    if (raw.mech !== undefined && typeof raw.mech !== 'string') problems.push(`station ${i + 1}: « mech » must be a mechanism name (${Object.keys(MECHANISMS).join(', ')})`)
    if (raw.ast !== undefined && !isObj(raw.ast)) problems.push(`station ${i + 1}: « ast » must be a tree node object`)
    if (raw.after !== undefined && !(Array.isArray(raw.after) && raw.after.every((d) => typeof d === 'number'))) problems.push(`station ${i + 1}: « after » must be a list of station indices`)
    if (label) legend.push({ label, tone, color: (LAMP as Record<string, string>)[tone] ?? LAMP.indigo })
    return {
      ...(raw.mech !== undefined ? { mech: raw.mech } : {}),
      ...(raw.ast !== undefined ? { ast: raw.ast } : {}),
      ...(raw.after !== undefined ? { after: raw.after } : {}),
      tone,
      label: `chat.station.${i + 1}`,
    }
  })
  if (problems.length) return { title, legend, problems }

  const layout = (scene.layout ?? defaultLayout(stations.length)) as SceneSpec['layout']
  if (!LAYOUTS.some((l) => l.kind === layout)) {
    return { title, legend, problems: [`layout « ${String(layout)} » unknown (${LAYOUTS.map((l) => l.kind).join(', ')})`] }
  }
  const body = {
    layout,
    stations,
    ...(scene.angles !== undefined ? { angles: scene.angles } : {}),
    ...(scene.home !== undefined ? { home: scene.home } : {}),
    ...(scene.stepSeconds !== undefined ? { stepSeconds: scene.stepSeconds } : {}),
    ...(scene.build !== undefined ? { build: scene.build } : {}),
  }
  const spec = { id: `chat-${hash(JSON.stringify(body))}`, ...body } as unknown as SceneSpec
  return { spec, title, legend, problems }
}

/** Check and build an `iso_scene`. Never throws: a refusal carries the list of corrections. */
export function compileIsoScene(data: unknown): IsoCompile {
  const { spec, title, legend, problems } = toSceneSpec(data)
  if (!spec || problems.length) return { ok: false, problems }
  try {
    const scene = defineScene(spec)
    return { ok: true, machine: scene.machine, legend, ...(title ? { title } : {}) }
  } catch (e) {
    if (e instanceof SceneError) return { ok: false, problems: [...e.problems] }
    // A shape the engine's checks did not foresee (a `null` motion, a string where a list goes…):
    // still a refusal, never a crash of the conversation.
    return { ok: false, problems: [`the scene could not be built: ${e instanceof Error ? e.message : String(e)}`] }
  }
}

/** What a model can use, for a refusal message or an instruction: names only. */
export const ISO_VOCABULARY = {
  layouts: LAYOUTS.map((l) => l.kind),
  mechanisms: Object.keys(MECHANISMS),
  objects: () => [...CATALOG.keys()],
  tones: TONES,
  limits: AST_LIMITS,
}
