// GENERATED from website@426fd63fe793882ef8490df5cff1b9a4f75b2520:src/three/iso/scene.ts by scripts/sync-iso-lib.mjs — do not edit.
// @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.
/**
 * API SÛRE pour décrire une scène isométrique (en-tête ou bloc de page) : `defineScene`.
 *
 * Une page décrit ce qu'elle veut montrer (des postes, chacun une mécanique, une teinte, un libellé) et l'objectif de
 * sa disposition ; `defineScene` VÉRIFIE tout avant de rendre la scène, et lève une `SceneError` qui dit quoi
 * corriger si quelque chose ne va pas :
 *
 *   - entrées : identifiant (kebab-case, unique), disposition connue, nombre de postes dans la plage de la disposition,
 *     mécanique connue, teinte prise dans la palette (pas de couleur libre), libellé = clé i18n ;
 *   - résultat (construit une fois) : rien sous le texte (SAFE), rien sous le repère de défilement (CUE), rien hors des
 *     bords (FRAME), les deux moitiés du pli téléphone garnies, budgets de faces respectés.
 *
 * Une page ne peut donc pas livrer une scène qui couvre son texte ou alourdit le site par erreur. Le reste (rendu,
 * cadrage, essaim d'agents à la construction, pilotes temps/défilement, repli SVG) est fourni.
 *
 * Module PUR (imports relatifs seulement) : lu par Node dans les tests.
 */
import { checkComposition, halves } from './compose.ts'
import { LAMP } from './iso.ts'
import { LAYOUTS, type LayoutKind } from './layouts.ts'
import type { MachineDef } from './machine.ts'
import { MECHANISMS, type MechId } from './mechanisms.ts'
import { makeStationMachine, type StationMachineDef } from './stations.ts'
import { findCycle, type BuildSpec } from './choreography.ts'
import { astMechanism, checkAst, type IsoNode } from './ast.ts'
import './catalog.ts'

/** Teintes permises (les lampes du produit). */
export type Tone = keyof typeof LAMP

export interface SceneStation {
  /** Mécanique posée sur le poste : une de la bibliothèque (voir `MECHANISMS`)… */
  mech?: MechId | undefined
  /** … ou un arbre de construction (protocole `ast.ts`, objets du catalogue `catalog.ts`). */
  ast?: IsoNode | undefined
  /** Teinte d'accent. */
  tone: Tone
  /** Clé i18n du libellé du poste. */
  label: string
  /** Construction : postes (indices) qui doivent être construits AVANT celui-ci. */
  after?: readonly number[] | undefined
}

export interface SceneSpec {
  /** Identifiant kebab-case, unique sur le site. */
  id: string
  /** Disposition (voir `LAYOUTS` : chacune répond à un objectif). */
  layout: LayoutKind
  stations: readonly SceneStation[]
  /** Anneau seulement : angles d'écran des postes (degrés, 0 = droite, 90 = bas). */
  angles?: readonly number[] | undefined
  /** Poste servi au premier pas (défaut 0). */
  home?: number | undefined
  /** Durée d'un pas du cycle, en secondes (défaut 1,5). */
  stepSeconds?: number | undefined
  /** Chorégraphie de l'apparition : `mode` (`parallel` | `sequential` | `waves`), `agents` (escouades), `squad`
   * (agents par escouade), `durationMs`. Avec les `after` des postes, elle dit QUI construit QUOI, QUAND. */
  build?: BuildSpec | undefined
  /** Perspective : 0 = isométrique (défaut) ; > 0 = force du raccourcissement en profondeur (borné à 0,25). */
  focal?: number | undefined
}

export interface Scene {
  readonly spec: SceneSpec
  /** La machine prête à rendre (`isoHeroArt`, `IsoIllustration`). */
  readonly machine: MachineDef
  /** La même scène sur une autre disposition (aperçu), vérifiée elle aussi. */
  on(layout: LayoutKind): MachineDef
}

export class SceneError extends Error {
  readonly sceneId: string
  readonly problems: readonly string[]
  constructor(sceneId: string, problems: readonly string[]) {
    super(`scène « ${sceneId} » refusée :\n  - ${problems.join('\n  - ')}`)
    this.name = 'SceneError'
    this.sceneId = sceneId
    this.problems = problems
  }
}

/** Nombre de postes admis par disposition. */
export const STATION_RANGE: Readonly<Record<LayoutKind, readonly [number, number]>> = {
  ring: [3, 12],
  stadium: [4, 12],
  arch: [3, 9],
  wings: [2, 10],
  corners: [4, 12],
  solo: [1, 1],
  compact: [1, 12],
  phone: [2, 12],
}

/** Budgets de faces : SVG de repli (dans le HTML) et rendu WebGL. */
export const SCENE_BUDGETS = { svgHero: 900, svgSolo: 200, lit: 4500 } as const

const defined = new Map<string, string>()

function checkSpec(spec: SceneSpec): string[] {
  const out: string[] = []
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(spec.id)) out.push(`id « ${spec.id} » : attendu kebab-case (lettres, chiffres, tirets)`)
  if (!LAYOUTS.some((l) => l.kind === spec.layout)) out.push(`disposition « ${spec.layout} » inconnue (${LAYOUTS.map((l) => l.kind).join(', ')})`)
  const range = STATION_RANGE[spec.layout]
  if (range && (spec.stations.length < range[0] || spec.stations.length > range[1]))
    out.push(`${spec.stations.length} poste(s) sur « ${spec.layout} » : de ${range[0]} à ${range[1]} attendus`)
  spec.stations.forEach((st, i) => {
    if ((st.mech === undefined) === (st.ast === undefined)) out.push(`poste ${i + 1} : donner soit \`mech\` (bibliothèque), soit \`ast\` (arbre de construction)`)
    else if (st.mech !== undefined && !(st.mech in MECHANISMS)) out.push(`poste ${i + 1} : mécanique « ${st.mech} » inconnue (${Object.keys(MECHANISMS).join(', ')})`)
    else if (st.ast !== undefined) for (const p of checkAst(st.ast)) out.push(`poste ${i + 1} (arbre) : ${p}`)
    if (!(st.tone in LAMP)) out.push(`poste ${i + 1} : teinte « ${st.tone} » hors palette (${Object.keys(LAMP).join(', ')})`)
    if (!/^[a-zA-Z0-9.-]+$/.test(st.label)) out.push(`poste ${i + 1} : libellé « ${st.label} » n'est pas une clé i18n`)
  })
  if (spec.angles && (spec.layout !== 'ring' || spec.angles.length !== spec.stations.length))
    out.push('angles : seulement pour l’anneau, un par poste')
  if (spec.home !== undefined && (spec.home < 0 || spec.home >= spec.stations.length)) out.push(`home ${spec.home} : hors des postes`)
  if (spec.stepSeconds !== undefined && (spec.stepSeconds < 0.6 || spec.stepSeconds > 10)) out.push(`stepSeconds ${spec.stepSeconds} : de 0,6 à 10 s`)
  if (spec.focal !== undefined && (spec.focal < 0 || spec.focal > 0.25)) out.push(`focal ${spec.focal} : de 0 à 0,25`)
  // Chorégraphie : dépendances valides et sans cycle, réglages dans leurs plages.
  spec.stations.forEach((st, i) => {
    for (const d of st.after ?? []) {
      if (!Number.isInteger(d) || d < 0 || d >= spec.stations.length) out.push(`poste ${i + 1} : after ${d} ne désigne aucun poste (0 à ${spec.stations.length - 1})`)
      else if (d === i) out.push(`poste ${i + 1} : ne peut pas s’attendre lui-même`)
    }
  })
  const deps = spec.stations.map((st) => (st.after ?? []).filter((d) => d >= 0 && d < spec.stations.length))
  const cycle = findCycle(deps)
  if (cycle) out.push(`dépendances en cycle : postes ${cycle.map((c) => c + 1).join(' → ')} → ${cycle[0]! + 1}`)
  const b = spec.build ?? {}
  if (b.mode !== undefined && !['parallel', 'sequential', 'waves'].includes(b.mode)) out.push(`build.mode « ${b.mode} » : parallel, sequential ou waves`)
  if (b.agents !== undefined && (!Number.isInteger(b.agents) || b.agents < 1 || b.agents > 6)) out.push(`build.agents ${b.agents} : de 1 à 6 escouades`)
  if (b.squad !== undefined && (!Number.isInteger(b.squad) || b.squad < 1 || b.squad > 4)) out.push(`build.squad ${b.squad} : de 1 à 4 agents par escouade`)
  if (b.durationMs !== undefined && (b.durationMs < 1500 || b.durationMs > 12000)) out.push(`build.durationMs ${b.durationMs} : de 1 500 à 12 000 ms`)
  return out
}

function checkMachine(m: MachineDef, layout: LayoutKind): string[] {
  const out: string[] = []
  const lit = m.build(m.t0, 2)
  const svg = m.build(m.t0, 1)
  const svgMax = layout === 'solo' ? SCENE_BUDGETS.svgSolo : SCENE_BUDGETS.svgHero
  if (svg.length > svgMax) out.push(`${svg.length} faces au SVG de repli (au plus ${svgMax}) : moins de postes, ou des détails en lod 2`)
  if (lit.length > SCENE_BUDGETS.lit) out.push(`${lit.length} faces au rendu WebGL (au plus ${SCENE_BUDGETS.lit})`)
  // Sans texte à entourer (gros plan, compact) ou portrait : pas de contrôle de composition d'en-tête.
  if (layout === 'solo' || layout === 'compact' || layout === 'phone') return out
  for (const v of checkComposition(m, lit).slice(0, 6)) {
    const why = v.rule === 'SAFE' ? 'passe sous le texte' : v.rule === 'CUE' ? 'couvre le repère de défilement' : 'sort du cadre'
    out.push(`« ${v.name} » ${why} (x ${v.x}, y ${v.y}) : changer de disposition ou réduire le poste`)
  }
  const [l, r] = halves(m, lit)
  if (l < 0.3 || r < 0.3) out.push(`pli téléphone déséquilibré (gauche ${l.toFixed(2)}, droite ${r.toFixed(2)}) : répartir les postes`)
  return out
}

/** Les contrôles de `defineScene` sans le registre des identifiants (scènes vivantes : la même scène change de forme). */
export const checkSceneSpec = (spec: SceneSpec): string[] => checkSpec(spec)
/** Budgets de faces (et composition d'en-tête si la disposition entoure un texte) d'une machine construite. */
export const checkSceneMachine = (m: MachineDef, layout: LayoutKind): string[] => checkMachine(m, layout)
/** La définition de machine à postes d'une spécification (arbres compilés, teintes résolues). */
export function stationDefOf(spec: SceneSpec): StationMachineDef {
  return {
    id: spec.id,
    layout: spec.layout,
    stations: spec.stations.map((s, i) => ({ mech: s.ast ? astMechanism(`${spec.id}-${i + 1}`, s.ast) : s.mech!, col: LAMP[s.tone], key: s.label })),
    degs: spec.angles,
    home: spec.home,
    stepS: spec.stepSeconds,
    focal: spec.focal,
    deps: spec.stations.map((s) => s.after ?? []),
    build: spec.build,
  }
}

/** Décrit, vérifie et construit une scène. Lève `SceneError` (avec la liste des corrections) si elle n'est pas sûre. */
export function defineScene(spec: SceneSpec): Scene {
  const problems = checkSpec(spec)
  const sig = JSON.stringify(spec)
  const prev = defined.get(spec.id)
  if (prev !== undefined && prev !== sig) {
    // Rechargement à chaud (serveur de développement) : le module qui définit la scène a été réévalué avec une version
    // modifiée — c'est la même scène, on la remplace. Partout ailleurs (tests, build), un doublon est une erreur.
    // `hot` côté navigateur ; côté rendu serveur du dev, `env.DEV` (vite) — jamais sous Node (tests) ni au build.
    const meta = import.meta as ImportMeta & { hot?: unknown; env?: { DEV?: boolean } }
    if (meta.hot || meta.env?.DEV) console.warn(`[three/iso] scène « ${spec.id} » redéfinie (rechargement à chaud)`)
    else problems.push(`id « ${spec.id} » déjà employé par une autre scène`)
  }
  if (problems.length) throw new SceneError(spec.id, problems)
  const def = stationDefOf(spec)
  const build = (layout: LayoutKind) => {
    const m = makeStationMachine(def, layout).machine
    const bad = checkMachine(m, layout)
    if (bad.length) throw new SceneError(layout === spec.layout ? spec.id : `${spec.id}@${layout}`, bad)
    return m
  }
  const machine = build(spec.layout)
  defined.set(spec.id, sig)
  const variants = new Map<LayoutKind, MachineDef>([[spec.layout, machine]])
  return {
    spec,
    machine,
    on(layout) {
      let m = variants.get(layout)
      if (!m) {
        m = build(layout)
        variants.set(layout, m)
      }
      return m
    },
  }
}
