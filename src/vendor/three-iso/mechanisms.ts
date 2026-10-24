// GENERATED from website@255d188e3498305845e72a27d2569810c72c2e1b:src/three/iso/mechanisms.ts by scripts/sync-iso-lib.mjs — do not edit.
// @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.
/**
 * Bibliothèque de MÉCANIQUES : de petites machines qui montrent une logique (pas une icône), à poser sur un poste de
 * n'importe quelle machine (`stations.ts`), sur n'importe quelle disposition (`layouts.ts`). Chacune est nommée par ce
 * qu'elle illustre, pas par la page qui l'emploie : « voies parallèles » sert à /features (assistants en parallèle) et
 * peut servir ailleurs (une file de CI, un essaim d'agents…).
 *
 * Contrat d'une mécanique : `parts` déclare ses pièces (une fois, au registre), `build` les dessine à l'instant donné
 * dans le repère du poste (−y vers le lecteur, x vers la GAUCHE de l'écran, z vers le haut ; dessus du socle en z,
 * empreinte utile ±1,4). Elle VIT au repos (`u`, `cyc`, `breathe`) et fait son GESTE quand le poste est servi (`g` de
 * 0 à 1, `lit` pour l'allumage). Sa couleur d'accent est `col` (celle du poste).
 *
 * Module PUR (imports relatifs seulement) : lu par Node dans les tests.
 */
import { ease, LAMP, MAT, ngon, rect, Rx, Ry, Rz, span, type Frame, type Vec3 } from './iso.ts'

/** Ce qu'une mécanique reçoit pour se dessiner. */
export interface MechCtx {
  /** Repère du poste (déjà posé, tourné vers le lecteur, mis à l'échelle). */
  B: Frame
  /** Dessus du socle. */
  z: number
  /** Temps continu (fraction de cycle). */
  u: number
  /** Geste du poste servi (0 → 1), 0 sinon. */
  g: number
  /** Allumage du poste servi (0 → 1). */
  lit: number
  served: boolean
  /** Rang du poste dans la machine. */
  i: number
  /** Pas courant du cycle. */
  step: number
  /** Couleur d'accent du poste. */
  col: string
  id(name: string): number
  ids(name: string): number[]
  o(part: number, col: string, x?: { emit?: string; alpha?: number }): { part: number; col: string; emit?: string; alpha?: number }
  glow(part: number, on: number, base?: number): { part: number; col: string; emit: string; alpha: number }
  /** Segments d'un rond selon le niveau de détail (SVG prérendu plus grossier). */
  seg(n: number): number
  breathe(u: number, n: number, ph?: number): number
  /** Avancée cyclique au repos (0..1, `n` fois par cycle). */
  cyc(n: number, ph?: number): number
  L3(a: Vec3, b: Vec3, t: number): Vec3
}

export type MechId = 'drawers' | 'dependency-graph' | 'parallel-lanes' | 'knowledge-graph' | 'local-vault' | 'skill-cartridge' | 'stair-procedure' | 'consent-gate' | 'model-selector' | 'reach-devices'

export interface Mechanism {
  id: MechId
  /** Ce que la mécanique illustre. */
  shows: string
  /** Déclare les pièces : `part(nom)` une pièce, `many(nom, n)` n pièces ; `lod: 2` = seulement au rendu éclairé. */
  parts(part: (n: string, o?: { lod?: 1 | 2; layer?: number }) => number, many: (n: string, k: number, o?: { lod?: 1 | 2 }) => number[]): Record<string, number | number[]>
  build(c: MechCtx): void
}

export const MECHANISMS: Readonly<Record<MechId, Mechanism>> = {
  'drawers': {
    id: 'drawers',
    shows: 'un classeur dont les tiroirs s\'ouvrent l\'un après l\'autre (un tout aux contenus divers)',
    parts: (part, many) => ({ body: part('classeur'), top: part('dessus'), fronts: many('façade de tiroir', 3), trays: many('tiroir', 3), handles: many('poignée', 3, { lod: 2 }), tags: many('étiquette', 3), items: many('contenu', 6, { lod: 2 }), card: part('fiche projet') }),
    build({ B, z, u, g, lit, served, ids, id, o, glow, breathe, cyc }) {
      // Un projet, avec ou sans code : un classeur dont les tiroirs (code, plans, notes) s'ouvrent l'un après l'autre.
      B.slab(-1.15, -0.75, z, 2.3, 1.6, 2.15, 0.08, o(id('body'), MAT.graphite))
      B.slab(-1.2, -0.8, z + 2.15, 2.4, 1.7, 0.12, 0.05, o(id('top'), MAT.steelL))
      const tagCol = [LAMP.green, LAMP.violet, LAMP.amber]
      const amb = Math.floor(cyc(1.5) * 3)
      ids('fronts').forEach((f, k) => {
        const zz = z + 0.15 + (2 - k) * 0.66
        const open = Math.max(0.7 * ease(span(g, k * 0.22, k * 0.22 + 0.4)), amb === k && !served ? 0.18 * breathe(u, 4.5) : 0)
        // Le tiroir : un bac qui sort vers le lecteur, son contenu visible dessus ; la façade porte une étiquette de couleur.
        B.slab(-0.95, -0.72 - open, zz + 0.05, 1.9, 1.3, 0.46, 0.04, o(ids('trays')[k]!, MAT.satin))
        if (open > 0.25)
          for (let j = 0; j < 2; j++) B.slab(0.55 - j * 0.85, -0.6 - open, zz + 0.51, 0.6, 0.4, 0.1 + 0.08 * j, 0.03, o(ids('items')[k * 2 + j]!, k === 0 ? '#2b3a33' : MAT.porcelain))
        B.slab(-1.05, -0.86 - open, zz, 2.1, 0.16, 0.58, 0.05, o(f, MAT.porcelain))
        B.slab(-0.35, -0.9 - open, zz + 0.2, 0.7, 0.05, 0.18, 0.02, o(ids('tags')[k]!, tagCol[k]!, open > 0.3 ? { emit: tagCol[k]! } : {}))
        B.slab(-0.25, -0.95 - open, zz + 0.42, 0.5, 0.06, 0.07, 0.02, o(ids('handles')[k]!, MAT.steelL))
      })
      // Sur le dessus, la fiche du projet, à la couleur du pilier.
      B.slab(-0.8, 0.0, z + 2.27, 1.6, 0.12, 0.85, 0.04, glow(id('card'), Math.max(lit, 0.35)))
    },
  },
  'dependency-graph': {
    id: 'dependency-graph',
    shows: 'un graphe de dépendances qui se valide dans l\'ordre jusqu\'au drapeau de l\'objectif',
    parts: (part, many) => ({ plate: part('plateau'), tasks: many('tâche', 4), goal: part('objectif'), pole: part('mât'), flag: part('drapeau'), deps: many('dépendance', 5), pulse: part('avancée', { lod: 2 }) }),
    build({ B, z, g, served, col, ids, id, o, glow, seg, cyc, L3 }) {
      // Un objectif découpé en tâches : un graphe de dépendances ; les tâches se valident dans l'ordre (une tâche attend
      // les siennes), une avancée parcourt le chemin, l'objectif hisse son drapeau quand tout est fait.
      B.slab(-1.45, -1.4, z, 2.9, 2.8, 0.14, 0.05, o(id('plate'), MAT.graphite))
      const T: Vec3[] = [
        [0.8, -0.9, z + 0.14],
        [-0.8, -0.9, z + 0.14],
        [0.55, 0.15, z + 0.14],
        [-0.65, 0.15, z + 0.14],
      ]
      const Gp: Vec3 = [0, 1.0, z + 0.14]
      const D: [Vec3, Vec3][] = [
        [T[0]!, T[2]!],
        [T[1]!, T[2]!],
        [T[1]!, T[3]!],
        [T[2]!, Gp],
        [T[3]!, Gp],
      ]
      const prog = served ? 4 + g : cyc(1, 0.2) * 5
      const done = Math.floor(prog)
      D.forEach(([a, b], k) => B.tube([a[0], a[1], a[2] + 0.3], [b[0], b[1], b[2] + 0.3], 0.05, o(ids('deps')[k]!, MAT.steelL), seg(8)))
      ids('tasks').forEach((t, k) => B.slab(T[k]![0] - 0.42, T[k]![1] - 0.32, T[k]![2], 0.84, 0.64, 0.42, 0.07, k < done ? o(t, LAMP.green, { emit: LAMP.green }) : o(t, MAT.porcelain)))
      const goalDone = done >= 5 || g > 0.6
      B.puck(Gp[0], Gp[1], Gp[2], 0.5, 0.4, 0.08, goalDone ? glow(id('goal'), 1) : o(id('goal'), MAT.porcelain), seg(20))
      const rise = goalDone ? 1 : 0.35
      B.tube([Gp[0], Gp[1], Gp[2] + 0.4], [Gp[0], Gp[1], Gp[2] + 1.8], 0.04, o(id('pole'), MAT.steelL), seg(8))
      B.slab(Gp[0] - 0.62, Gp[1] - 0.03, Gp[2] + 0.75 + 0.75 * rise, 0.6, 0.06, 0.38, 0.02, goalDone ? glow(id('flag'), 1) : o(id('flag'), col))
      const e = D[Math.min(4, Math.max(0, done - 1))]!
      const q = L3(e[0], e[1], prog % 1)
      B.sphere([q[0], q[1], q[2] + 0.3], 0.11, glow(id('pulse'), 1), seg(10), seg(6))
    },
  },
  'parallel-lanes': {
    id: 'parallel-lanes',
    shows: 'trois voies où un lot de tâches avance de front vers trois assistants (travail en parallèle)',
    parts: (part, many) => ({ plate: part('plateau'), hopper: part('trémie'), lanes: many('voie', 3), bots: many('assistant', 3), heads: many('tête', 3), eyes: many('regard', 3, { lod: 2 }), tasks: many('tâche', 6) }),
    build({ B, z, lit, served, ids, id, o, glow, seg, cyc }) {
      // Les tâches indépendantes partent EN MÊME TEMPS : trois voies parallèles, un lot de trois tâches avance de front
      // depuis la trémie jusqu'à trois assistants, puis le lot suivant (une vague).
      B.slab(-1.5, -1.45, z, 3.0, 2.9, 0.14, 0.05, o(id('plate'), MAT.graphite))
      B.slab(-1.3, 0.85, z + 0.14, 2.6, 0.55, 0.9, 0.08, o(id('hopper'), MAT.steelL))
      const X = [0.9, 0, -0.9]
      ids('lanes').forEach((l, k) => B.slab(X[k]! - 0.24, -0.95, z + 0.14, 0.48, 1.85, 0.06, 0.02, o(l, MAT.satin)))
      const speed = served ? 2.2 : 1.2
      for (let w = 0; w < 2; w++) {
        const t = cyc(4 * speed, w * 0.5)
        X.forEach((x, k) => {
          const y = 0.75 - 1.55 * t
          const arrived = t > 0.85
          B.slab(x - 0.2, y - 0.2, z + 0.2, 0.4, 0.4, 0.34, 0.05, arrived ? glow(ids('tasks')[w * 3 + k]!, 1) : o(ids('tasks')[w * 3 + k]!, MAT.porcelain))
        })
      }
      X.forEach((x, k) => {
        B.puck(x, -1.15, z + 0.14, 0.3, 0.5, 0.06, o(ids('bots')[k]!, MAT.porcelain), seg(16))
        B.sphere([x, -1.15, z + 0.86], 0.25, o(ids('heads')[k]!, MAT.porcelain), seg(14), seg(8))
        B.slab(x - 0.16, -1.42, z + 0.82, 0.32, 0.05, 0.1, 0.02, glow(ids('eyes')[k]!, Math.max(lit, 0.6)))
      })
    },
  },
  'knowledge-graph': {
    id: 'knowledge-graph',
    shows: 'un graphe de notes autour d\'une décision ; une note se pose et se relie',
    parts: (part, many) => ({ plate: part('plateau'), nodes: many('note', 5), decision: part('décision'), stems: many('tige', 6, { lod: 2 }), links: many('lien', 7), grow: part('nouveau lien'), card: part('nouvelle note'), pulse: part('impulsion', { lod: 2 }) }),
    build({ B, z, g, lit, served, ids, id, o, glow, seg, cyc, L3 }) {
      // Ce qui a été appris et décidé reste avec le projet : un graphe de notes autour d'une décision ; une nouvelle note
      // descend, se pose et un lien pousse vers la décision.
      B.puck(0, 0, z, 1.45, 0.14, 0.05, o(id('plate'), MAT.graphite), seg(28))
      const N: Vec3[] = [
        [-1.0, 0.4, z + 0.9],
        [1.0, 0.5, z + 1.1],
        [-0.55, -0.85, z + 0.7],
        [0.75, -0.75, z + 1.5],
        [0.05, 0.95, z + 1.7],
      ]
      const C: Vec3 = [0, 0, z + 1.25]
      const L: [Vec3, Vec3][] = [
        [C, N[0]!],
        [C, N[1]!],
        [C, N[2]!],
        [C, N[3]!],
        [C, N[4]!],
        [N[0]!, N[4]!],
        [N[1]!, N[3]!],
      ]
      L.forEach(([a, b], k) => B.tube(a, b, 0.045, o(ids('links')[k]!, MAT.steelL), seg(8)))
      ids('stems').forEach((t, k) => {
        const q = k < 5 ? N[k]! : C
        B.tube([q[0], q[1], z + 0.14], [q[0], q[1], q[2] - 0.2], 0.025, o(t, MAT.graphite), seg(6))
      })
      ids('nodes').forEach((n, k) => B.sphere(N[k]!, 0.24, o(n, MAT.porcelain), seg(16), seg(10)))
      // La décision : un diamant à la couleur du pilier.
      B.loft(ngon(0.42, 4), ngon(0.01, 4), 0.42, { ...glow(id('decision'), Math.max(lit, 0.6)), at: C })
      B.loft(ngon(0.42, 4), ngon(0.01, 4), -0.42, { ...glow(id('decision'), Math.max(lit, 0.6)), at: C })
      // La nouvelle note : elle descend à sa place puis son lien pousse vers la décision.
      const drop = served ? g : cyc(1.2, 0.3)
      const land: Vec3 = [-1.05, -0.55, z + 1.55]
      const fall = ease(span(drop, 0, 0.5))
      B.slab(land[0] - 0.28, land[1] - 0.04, land[2] + 1.4 * (1 - fall), 0.56, 0.08, 0.4, 0.03, o(id('card'), MAT.porcelain))
      const grow = ease(span(drop, 0.5, 0.9))
      if (grow > 0.02) B.tube([land[0], land[1], land[2] + 0.2], L3([land[0], land[1], land[2] + 0.2], C, grow), 0.045, glow(id('grow'), 1), seg(8))
      const [pa, pb] = L[Math.floor(cyc(10) * L.length)]!
      B.sphere(L3(pa, pb, cyc(70)), 0.08, glow(id('pulse'), 1), seg(8), seg(5))
    },
  },
  'local-vault': {
    id: 'local-vault',
    shows: 'l\'original reste dans un coffre local, le projet n\'en garde qu\'un lien',
    parts: (part, many) => ({ safe: part('coffre'), door: part('porte'), dial: part('molette'), sheets: many('original', 3), tray: part('projet'), card: part('lien vers l’original'), chain: many('maillon', 5, { lod: 2 }) }),
    build({ B, z, u, g, lit, served, ids, id, o, glow, seg, breathe, cyc }) {
      // Tes fichiers restent chez toi : l'original est dans un coffre local ; le projet n'en garde qu'un lien, une chaîne
      // qui s'allume quand le poste est servi (la porte s'ouvre, l'original apparaît).
      B.slab(0.05, -0.55, z, 1.35, 1.25, 1.5, 0.08, o(id('safe'), MAT.graphite))
      ids('sheets').forEach((sh, k) => B.slab(0.2, -0.35 + k * 0.05, z + 0.15 + k * 0.1, 1.05, 0.9, 0.06, 0.01, o(sh, k % 2 ? MAT.porcelain : '#cfd5e3')))
      // Porte : charnière sur l'arête gauche (x = 1,4), elle pivote vers le lecteur.
      const swing = 1.25 * ease(span(g, 0.05, 0.5)) + (served ? 0 : 0.08 * breathe(u, 2))
      B.sub([1.4, -0.58, z + 0.05], Rz(swing)).slab(-1.3, -0.08, 0, 1.3, 0.1, 1.4, 0.04, o(id('door'), MAT.steel))
      B.puck(0.72 - 0.6 * Math.sin(swing), -0.7 - 0.6 * (1 - Math.cos(swing)), z + 0.75, 0.2, 0.1, 0.03, o(id('dial'), MAT.brassL), seg(14))
      // Le projet : un bac et la fiche qui pointe vers l'original.
      B.slab(-1.45, -0.6, z, 1.15, 1.25, 0.22, 0.05, o(id('tray'), MAT.satin))
      B.slab(-1.35, -0.2, z + 0.22, 0.95, 0.12, 1.0, 0.04, o(id('card'), MAT.porcelain))
      ids('chain').forEach((c, k) => {
        const t = (k + 1) / 6
        B.sphere([-0.85 + 1.5 * t, -0.25, z + 1.25 + 0.35 * Math.sin(t * Math.PI)], 0.075, glow(c, Math.max(lit, k === Math.floor(cyc(5) * 5) ? 0.9 : 0.2)), seg(8), seg(5))
      })
    },
  },
  'skill-cartridge': {
    id: 'skill-cartridge',
    shows: 'la bonne cartouche se lève et s\'enfiche dans l\'assistant au bon moment',
    parts: (part, many) => ({ rack: part('râtelier'), carts: many('cartouche', 3), labels: many('étiquette', 3), body: part('assistant'), head: part('tête'), visor: part('visière'), slot: part('prise'), spark: part('éveil') }),
    build({ B, z, u, g, served, i, step, ids, id, o, glow, seg, breathe, L3 }) {
      // Des connaissances qui se réveillent au bon moment : un râtelier de trois cartouches ; au bon moment, l'une se lève,
      // vient s'enficher dans le dos de l'assistant, et sa visière s'allume.
      B.slab(-1.3, 0.55, z, 2.6, 0.75, 0.5, 0.06, o(id('rack'), MAT.graphite))
      const labelCol = [LAMP.indigo, LAMP.violet, LAMP.sky]
      const pick = (step + i) % 3
      const travel = served ? ease(span(g, 0, 0.7)) : 0
      ids('carts').forEach((c, k) => {
        const home: Vec3 = [0.85 - k * 0.85, 0.92, z + 0.5]
        const plug: Vec3 = [0, -0.05, z + 1.55]
        const t = k === pick ? travel : 0
        const at = L3(home, plug, t)
        const hop = Math.sin(t * Math.PI) * 0.8 + (k === pick && !served ? 0.12 * breathe(u, 3) : 0)
        B.slab(at[0] - 0.28, at[1] - 0.16, at[2] + hop, 0.56, 0.32, 0.85, 0.05, o(c, MAT.porcelain))
        B.slab(at[0] - 0.2, at[1] - 0.19, at[2] + hop + 0.35, 0.4, 0.04, 0.35, 0.02, o(ids('labels')[k]!, labelCol[k]!, t > 0.95 ? { emit: labelCol[k]! } : {}))
      })
      // L'assistant : corps arrondi, tête, visière, prise dans le dos.
      B.puck(0, -0.55, z, 0.62, 1.0, 0.18, o(id('body'), MAT.porcelain), seg(22))
      B.sphere([0, -0.55, z + 1.45], 0.48, o(id('head'), MAT.porcelain), seg(18), seg(10))
      B.slab(-0.34, -1.02, z + 1.38, 0.68, 0.06, 0.2, 0.04, glow(id('visor'), Math.max(travel > 0.95 ? 1 : 0, 0.3 + 0.2 * breathe(u, 3))))
      B.slab(-0.22, -0.12, z + 0.95, 0.44, 0.2, 0.3, 0.03, o(id('slot'), MAT.dark))
      if (travel > 0.95) B.sphere([0, -0.05, z + 2.55], 0.12 + 0.06 * breathe(u, 12), glow(id('spark'), 1), seg(10), seg(6))
    },
  },
  'stair-procedure': {
    id: 'stair-procedure',
    shows: 'un escalier qu\'un jeton gravit, chaque marche passée se valide',
    parts: (part, many) => ({ steps: many('étape', 4), rings: many('validée', 4), arrows: many('enchaînement', 3, { lod: 2 }), token: part('jeton') }),
    build({ B, z, g, served, ids, id, o, glow, seg, cyc }) {
      // Une procédure suivie pas à pas : un escalier de quatre marches ; un jeton les gravit une à une, chaque marche
      // passée s'allume en vert sur sa contremarche ; servie, la procédure va jusqu'en haut.
      const W = 0.62
      const prog = served ? 3 * g : cyc(1.4) * 4
      const at = Math.min(3, prog)
      const top = (k: number) => z + 0.28 + k * 0.42
      ids('steps').forEach((d, k) => {
        const x = 1.15 - k * 0.72
        B.slab(x - W / 2 - 0.02, -0.75, z, W, 1.5, top(k) - z, 0.06, o(d, MAT.porcelain))
        B.slab(x - W / 2 + 0.06, -0.79, top(k) - 0.18, W - 0.12, 0.05, 0.1, 0.02, k < at ? glow(ids('rings')[k]!, 1) : o(ids('rings')[k]!, MAT.steelL))
      })
      ids('arrows').forEach((ar, k) => {
        const x0 = 1.15 - k * 0.72
        B.tube([x0 - 0.12, 0.45, top(k) + 0.05], [x0 - 0.6, 0.45, top(k + 1) + 0.05], 0.035, o(ar, MAT.steelL), seg(6))
      })
      const k0 = Math.floor(Math.min(2.999, at))
      const t = at - k0
      const x0 = 1.15 - k0 * 0.72
      B.sphere([x0 - 0.72 * t, -0.1, top(k0) + 0.42 * t + 0.24 + 0.45 * Math.sin(t * Math.PI)], 0.22, glow(id('token'), 1), seg(14), seg(8))
    },
  },
  'consent-gate': {
    id: 'consent-gate',
    shows: 'une barrière entre deux instances, qui ne se lève qu\'au feu vert',
    parts: (part, many) => ({ towers: many('instance', 2), screens: many('écran', 2), posts: many('borne', 2), bar: part('barrière'), lamp: part('accord'), packet: part('paquet'), road: part('passage') }),
    build({ B, z, u, g, lit, served, ids, id, o, glow, seg, breathe }) {
      // Rien ne passe sans ton accord : deux instances, une barrière entre elles ; le paquet attend ; à l'accord le feu
      // passe au vert, la barrière se lève et le paquet traverse.
      const X = [1.05, -1.05]
      ids('towers').forEach((t, k) => B.slab(X[k]! - 0.38, -0.35, z, 0.76, 0.75, 1.55, 0.07, o(t, MAT.graphite)))
      ids('screens').forEach((sc, k) => B.slab(X[k]! - 0.28, -0.39, z + 0.55, 0.56, 0.05, 0.7, 0.03, glow(sc, Math.max(lit, 0.45))))
      B.slab(-0.7, -0.35, z, 1.4, 0.5, 0.06, 0.02, o(id('road'), MAT.satin))
      ids('posts').forEach((pp, k) => B.cyl(k ? -0.45 : 0.45, -0.65, z, 0.07, 0.9, o(pp, MAT.steelL), seg(8)))
      const ok = served ? ease(span(g, 0, 0.3)) : 0
      // Barre : pivote autour de la borne de gauche (lever de 0 à 80°).
      B.sub([0.45, -0.65, z + 0.85], Ry(-1.4 * ok)).slab(-0.95, -0.04, -0.05, 0.95, 0.08, 0.1, 0.03, o(id('bar'), ok > 0.5 ? LAMP.green : LAMP.red))
      B.sphere([0.45, -0.65, z + 1.05], 0.1, o(id('lamp'), ok > 0.5 ? LAMP.green : LAMP.amber, { emit: ok > 0.5 ? LAMP.green : LAMP.amber }), seg(10), seg(6))
      const cross = served ? ease(span(g, 0.3, 0.9)) : 0
      const wait = served ? 0 : 0.06 * breathe(u, 6)
      B.slab(0.6 - 1.2 * cross - 0.16, -0.32, z + 0.08 + wait, 0.32, 0.32, 0.32, 0.05, glow(id('packet'), 1))
    },
  },
  'model-selector': {
    id: 'model-selector',
    shows: 'un sélecteur rotatif entre quatre puces (Auto le fait tourner)',
    parts: (part, many) => ({ base: part('platine'), chips: many('modèle', 4), dies: many('cœur', 4), dial: part('sélecteur'), pointer: part('aiguille'), tracks: many('piste', 4, { lod: 2 }) }),
    build({ B, z, served, i, step, ids, id, o, glow, seg, cyc }) {
      // Ton choix d'IA, ou Auto : un sélecteur rotatif entre quatre puces de modèle ; au repos (Auto) l'aiguille passe de
      // l'une à l'autre ; servi, elle se pose sur une et son cœur s'allume.
      B.puck(0, 0, z, 1.45, 0.16, 0.05, o(id('base'), MAT.graphite), seg(28))
      const A = [45, 135, 225, 315].map((d) => (d * Math.PI) / 180)
      const choice = served ? (step + i) % 4 : Math.floor(cyc(2) * 4)
      A.forEach((a, k) => {
        const cx = 0.95 * Math.cos(a)
        const cy = 0.95 * Math.sin(a)
        B.slab(cx - 0.36, cy - 0.36, z + 0.16, 0.72, 0.72, 0.36, 0.06, o(ids('chips')[k]!, MAT.dark))
        B.slab(cx - 0.22, cy - 0.22, z + 0.52, 0.44, 0.44, 0.05, 0.02, k === choice ? glow(ids('dies')[k]!, served ? 1 : 0.7) : o(ids('dies')[k]!, MAT.brassL))
        B.slab(0.18 * Math.cos(a) - 0.03, 0.18 * Math.sin(a) - 0.03, z + 0.16, 0.06 + 0.5 * Math.abs(Math.cos(a)), 0.06 + 0.5 * Math.abs(Math.sin(a)), 0.02, 0, o(ids('tracks')[k]!, MAT.brassL))
      })
      B.puck(0, 0, z + 0.16, 0.42, 0.5, 0.1, o(id('dial'), MAT.steelL), seg(20))
      const target = A[choice]!
      const ang = served ? target : target - 0.6 * (1 - ease(span(cyc(2) * 4 % 1, 0, 0.4)))
      B.loft(rect(0.8, 0.14), rect(0.8, 0.14), 0.1, { ...glow(id('pointer'), 1), rot: Rz(ang), at: [0.32 * Math.cos(ang), 0.32 * Math.sin(ang), z + 0.66] })
    },
  },
  'reach-devices': {
    id: 'reach-devices',
    shows: 'un serveur qui envoie le signal vers un téléphone et un portable',
    parts: (part, many) => ({ rack: part('serveur'), leds: many('voyant', 3), globe: part('globe'), phone: part('téléphone'), phoneScreen: part('écran du téléphone'), laptop: part('portable'), lid: part('écran du portable'), waves: many('signal', 6, { lod: 2 }) }),
    build({ B, z, u, lit, served, ids, id, o, glow, seg, breathe, cyc, L3 }) {
      // Accessible de partout : ton serveur (avec le globe de ton domaine) envoie le signal vers un téléphone et un portable.
      B.slab(0.35, 0.2, z, 0.95, 0.9, 1.8, 0.07, o(id('rack'), MAT.graphite))
      ids('leds').forEach((l, k) => B.slab(0.48, 0.16, z + 0.4 + k * 0.45, 0.7, 0.05, 0.08, 0.02, glow(l, 0.5 + 0.5 * breathe(u, 6, k))))
      B.sphere([0.82, 0.65, z + 2.25], 0.42, o(id('globe'), MAT.porcelain), seg(16), seg(10))
      // Téléphone debout, écran vers le lecteur.
      B.slab(-1.35, -1.0, z, 0.6, 0.14, 1.1, 0.06, o(id('phone'), MAT.dark))
      B.slab(-1.29, -1.03, z + 0.08, 0.48, 0.04, 0.92, 0.03, o(id('phoneScreen'), LAMP.sky, { emit: LAMP.sky, alpha: 0.55 + 0.45 * Math.max(lit, breathe(u, 3)) }))
      // Portable : socle et écran incliné.
      B.slab(-0.6, -0.95, z, 1.1, 0.75, 0.08, 0.03, o(id('laptop'), MAT.steelL))
      B.loft(rect(1.05, 0.06), rect(1.05, 0.06), 0.7, { part: id('lid'), col: LAMP.sky, emit: LAMP.sky, alpha: 0.55 + 0.45 * Math.max(lit, breathe(u, 3, 1)), rot: Rx(-0.25), at: [-0.05, -0.25, z + 0.08] })
      const src: Vec3 = [0.6, 0.0, z + 1.6]
      const dst: Vec3[] = [
        [-1.05, -1.0, z + 1.25],
        [-0.05, -0.4, z + 0.85],
      ]
      ids('waves').forEach((wv, k) => {
        const d = dst[k % 2]!
        const t = cyc(served ? 3 : 1.5, k / 3)
        const q = L3(src, d, t)
        B.sphere([q[0], q[1], q[2] + 0.5 * Math.sin(t * Math.PI)], 0.07, glow(wv, 1), seg(8), seg(5))
      })
    },
  },
}
