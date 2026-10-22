// GENERATED from website@8efd848719228d64dd983232c67cfca66c3db191:src/three/iso/choreography.ts by scripts/sync-iso-lib.mjs — do not edit.
// @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.
/**
 * Chorégraphie de la construction d'une scène : QUI construit QUOI, QUAND — déclarée par la scène, calculée ici.
 *
 * Même modèle que PO : des tâches (les postes), des dépendances (`after` : un poste attend que d'autres soient
 * construits), des agents en parallèle (des escouades), et trois façons d'enchaîner :
 *
 *   parallel    ordonnancement par liste : chaque escouade libre prend le premier poste PRÊT (dépendances
 *               construites) ; autant de chantiers à la fois que d'escouades (défaut) ;
 *   sequential  un poste après l'autre, dans l'ordre des dépendances (une seule escouade) ;
 *   waves       par vagues : tous les postes d'un même niveau de dépendance démarrent ensemble, la vague suivante
 *               attend la fin de la précédente (une escouade par poste de la vague).
 *
 * Le calendrier est en « unités de chantier » (un poste = une unité), puis ramené dans la fenêtre des postes de
 * l'apparition (après le tracé de la voie, avant le départ de l'essaim). Module PUR : lu par Node dans les tests.
 */

export type BuildMode = 'parallel' | 'sequential' | 'waves'

export interface BuildSpec {
  /** Enchaînement des chantiers (défaut `parallel`). */
  mode?: BuildMode
  /** Escouades au travail en même temps (mode `parallel`), de 1 à 6 (défaut 4). */
  agents?: number
  /** Agents par escouade, de 1 à 4 (défaut 3). */
  squad?: number
  /** Durée totale de l'apparition, de 1 500 à 12 000 ms (défaut 7 000). */
  durationMs?: number
}

export interface StationBuild {
  /** Début et durée du chantier, en fraction de l'apparition (0..1). */
  start: number
  dur: number
  /** Escouade qui le construit. */
  agent: number
}

export interface BuildPlan {
  stations: StationBuild[]
  /** Nombre d'escouades effectivement employées, et d'agents par escouade. */
  agents: number
  squad: number
  ms: number
}

export const BUILD_DEFAULTS = { mode: 'parallel' as BuildMode, agents: 4, squad: 3, durationMs: 7000 }
/** Fenêtre des chantiers dans l'apparition (la voie se trace avant, l'essaim part après). */
export const STATION_WINDOW = [0.36, 0.9] as const
/** Durée maximale d'un chantier (fraction de l'apparition) : un poste seul ne s'étire pas sur toute la fenêtre. */
const MAX_DUR = 0.2

/** Cycle dans les dépendances (indices des postes du cycle), ou null. */
export function findCycle(deps: readonly (readonly number[])[]): number[] | null {
  const state = deps.map(() => 0)
  const stack: number[] = []
  const visit = (i: number): number[] | null => {
    if (state[i] === 1) return stack.slice(stack.indexOf(i))
    if (state[i] === 2) return null
    state[i] = 1
    stack.push(i)
    for (const d of deps[i] ?? []) {
      const c = visit(d)
      if (c) return c
    }
    stack.pop()
    state[i] = 2
    return null
  }
  for (let i = 0; i < deps.length; i++) {
    const c = visit(i)
    if (c) return c
  }
  return null
}

/** Niveau de chaque poste (0 = sans dépendance ; sinon 1 + le plus haut niveau de ses dépendances). */
function levels(deps: readonly (readonly number[])[]): number[] {
  const memo: number[] = deps.map(() => -1)
  const lv = (i: number): number => {
    if (memo[i]! >= 0) return memo[i]!
    memo[i] = 0
    const v = Math.max(-1, ...(deps[i] ?? []).map(lv)) + 1
    memo[i] = v
    return v
  }
  return deps.map((_, i) => lv(i))
}

/** Calendrier des chantiers de `n` postes (`deps[i]` : postes que i attend), selon `spec`. Les dépendances sont
 * supposées valides et sans cycle (`defineScene` le vérifie). */
export function planBuild(n: number, deps: readonly (readonly number[])[], spec: BuildSpec = {}): BuildPlan {
  const mode = spec.mode ?? BUILD_DEFAULTS.mode
  const squad = spec.squad ?? BUILD_DEFAULTS.squad
  const ms = spec.durationMs ?? BUILD_DEFAULTS.durationMs
  const D = Array.from({ length: n }, (_, i) => deps[i] ?? [])
  const start: number[] = new Array(n).fill(0)
  const agent: number[] = new Array(n).fill(0)
  let agents: number
  if (mode === 'waves') {
    const L = levels(D)
    const width = new Map<number, number>()
    for (let i = 0; i < n; i++) {
      const k = width.get(L[i]!) ?? 0
      start[i] = L[i]!
      agent[i] = k
      width.set(L[i]!, k + 1)
    }
    agents = Math.max(...width.values())
  } else {
    // Ordonnancement par liste : à chaque instant, chaque escouade libre prend le premier poste prêt (ordre déclaré).
    agents = mode === 'sequential' ? 1 : Math.max(1, Math.min(spec.agents ?? BUILD_DEFAULTS.agents, n))
    const end: number[] = new Array(n).fill(Infinity)
    const free: number[] = new Array(agents).fill(0)
    const done = new Set<number>()
    while (done.size < n) {
      // L'escouade qui se libère la première.
      let a = 0
      for (let k = 1; k < agents; k++) if (free[k]! < free[a]!) a = k
      let best = -1
      let bestAt = Infinity
      for (let i = 0; i < n; i++) {
        if (done.has(i)) continue
        if (D[i]!.some((d) => !done.has(d))) continue
        const ready = Math.max(free[a]!, ...D[i]!.map((d) => end[d]!))
        if (ready < bestAt) {
          bestAt = ready
          best = i
        }
      }
      if (best < 0) break // impossible si les dépendances sont sans cycle
      start[best] = bestAt
      end[best] = bestAt + 1
      agent[best] = a
      free[a] = bestAt + 1
      done.add(best)
    }
  }
  const span = Math.max(1, ...start.map((s) => s + 1))
  const [w0, w1] = STATION_WINDOW
  const unit = Math.min(MAX_DUR / 0.9, (w1 - w0) / span)
  return {
    stations: start.map((s, i) => ({ start: w0 + s * unit, dur: unit * 0.9, agent: agent[i]! })),
    agents,
    squad,
    ms,
  }
}
