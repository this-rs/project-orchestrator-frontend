// GENERATED from website@426fd63fe793882ef8490df5cff1b9a4f75b2520:src/three/iso/catalog.ts by scripts/sync-iso-lib.mjs — do not edit.
// @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.
/**
 * Catalogue d'OBJETS tout faits, décrits avec le protocole `ast.ts` : des briques qu'une mécanique (d'une page ou d'un
 * modèle dans le chat) réutilise par `{ kind: 'use', ref: '…' }` et EMBOÎTE par leurs points d'accroche (`sockets`).
 *
 * Chaque objet est petit, lisible à la taille d'un poste, et dans la palette. Ajouter un objet : une entrée ici, un
 * test l'accepte (`checkAst`) ou dit quoi corriger.
 *
 * Module PUR (imports relatifs seulement) : lu par Node dans les tests.
 */
import { CATALOG, type IsoNode } from './ast.ts'

export const OBJECTS: Readonly<Record<string, IsoNode>> = {
  /** Un agent : corps clair, cœur lumineux, anneau qui tourne. Accroche : `beam` (sous lui). */
  agent: {
    kind: 'group',
    sockets: { beam: [0, 0, -0.3] },
    children: [
      { kind: 'sphere', name: 'corps', r: 0.32, at: [0, 0, 0.32] },
      { kind: 'sphere', name: 'cœur', r: 0.15, at: [0, -0.2, 0.34], tone: 'indigo', glow: true, motion: { kind: 'pulse', period: 3 } },
      { kind: 'ring', name: 'anneau', r: 0.52, w: 0.07, at: [0, 0, 0.3], mat: 'steelL', motion: { kind: 'spin', period: 2 } },
    ],
  },
  /** Un écran sur pied, face au lecteur. Accroche : `top`. */
  screen: {
    kind: 'group',
    sockets: { top: [0, 0, 1.3] },
    children: [
      { kind: 'slab', name: 'pied', size: [0.5, 0.4, 0.12], mat: 'graphite' },
      { kind: 'slab', name: 'mât', size: [0.12, 0.12, 0.45], at: [0, 0, 0.12], mat: 'steelL' },
      { kind: 'slab', name: 'cadre', size: [1.1, 0.12, 0.72], at: [0, 0, 0.55], mat: 'dark' },
      { kind: 'slab', name: 'écran', size: [0.96, 0.04, 0.58], at: [0, -0.07, 0.62], tone: 'accent', glow: true, motion: { kind: 'pulse', period: 2 } },
    ],
  },
  /** Une puce : boîtier sombre, broches dorées, cœur lumineux. Accroche : `top`. */
  chip: {
    kind: 'group',
    sockets: { top: [0, 0, 0.32] },
    children: [
      { kind: 'slab', name: 'boîtier', size: [1.0, 1.0, 0.26], mat: 'dark' },
      { kind: 'slab', name: 'cœur', size: [0.52, 0.52, 0.04], at: [0, 0, 0.26], tone: 'accent', glow: true, motion: { kind: 'pulse', period: 4 } },
      { kind: 'slab', name: 'broches g', size: [0.08, 0.8, 0.06], at: [0.55, 0, 0.06], mat: 'brassL' },
      { kind: 'slab', name: 'broches d', size: [0.08, 0.8, 0.06], at: [-0.55, 0, 0.06], mat: 'brassL' },
    ],
  },
  /** Un drapeau sur son mât (un objectif atteint). Accroche : `base`. */
  flag: {
    kind: 'group',
    sockets: { base: [0, 0, 0] },
    children: [
      { kind: 'tube', name: 'mât', at: [0, 0, 0], to: [0, 0, 1.3], r: 0.035, mat: 'steelL' },
      { kind: 'slab', name: 'drapeau', size: [0.5, 0.05, 0.3], at: [-0.26, 0, 0.95], tone: 'accent', glow: true, motion: { kind: 'bob', period: 2, amount: 0.05 } },
    ],
  },
  /** Une flèche (un enchaînement), pointée vers +x local. */
  arrow: {
    kind: 'group',
    children: [
      { kind: 'tube', name: 'tige', at: [-0.4, 0, 0], to: [0.25, 0, 0], r: 0.04, mat: 'steelL' },
      { kind: 'cone', name: 'pointe', r: 0.12, h: 0.24, at: [0.22, 0, 0], rot: [0, 90, 0], mat: 'steelL' },
    ],
  },
  /** Un serveur : armoire, trois voyants qui clignotent. Accroche : `top`. */
  server: {
    kind: 'group',
    sockets: { top: [0, 0, 1.5] },
    children: [
      { kind: 'slab', name: 'armoire', size: [0.8, 0.75, 1.45], mat: 'graphite' },
      { kind: 'slab', name: 'voyant 1', size: [0.55, 0.04, 0.07], at: [0, -0.39, 0.35], tone: 'accent', glow: true, motion: { kind: 'pulse', period: 5 } },
      { kind: 'slab', name: 'voyant 2', size: [0.55, 0.04, 0.07], at: [0, -0.39, 0.7], tone: 'accent', glow: true, motion: { kind: 'pulse', period: 5, phase: 0.33 } },
      { kind: 'slab', name: 'voyant 3', size: [0.55, 0.04, 0.07], at: [0, -0.39, 1.05], tone: 'accent', glow: true, motion: { kind: 'pulse', period: 5, phase: 0.66 } },
    ],
  },
  /** Un document : une feuille et ses lignes de texte. */
  document: {
    kind: 'group',
    children: [
      { kind: 'slab', name: 'feuille', size: [0.9, 1.15, 0.05], mat: 'porcelain' },
      { kind: 'slab', name: 'ligne 1', size: [0.62, 0.08, 0.02], at: [0, 0.3, 0.05], mat: 'graphite' },
      { kind: 'slab', name: 'ligne 2', size: [0.62, 0.08, 0.02], at: [0, 0.08, 0.05], mat: 'graphite' },
      { kind: 'slab', name: 'ligne 3', size: [0.4, 0.08, 0.02], at: [0.11, -0.14, 0.05], mat: 'graphite' },
    ],
  },
  /** Un nœud de graphe (une note) sur sa tige. Accroche : `top`. */
  node: {
    kind: 'group',
    sockets: { top: [0, 0, 1.05] },
    children: [
      { kind: 'tube', name: 'tige', at: [0, 0, 0], to: [0, 0, 0.6], r: 0.03, mat: 'graphite' },
      { kind: 'sphere', name: 'nœud', r: 0.24, at: [0, 0, 0.8] },
    ],
  },
  /** Une marche (une étape) dont la contremarche s'allume. Accroche : `top`. */
  step: {
    kind: 'group',
    sockets: { top: [0, 0, 0.42] },
    children: [
      { kind: 'slab', name: 'marche', size: [0.62, 1.2, 0.42] },
      { kind: 'slab', name: 'validée', size: [0.48, 0.04, 0.08], at: [0, -0.62, 0.26], tone: 'green', glow: true },
    ],
  },
}

for (const [k, v] of Object.entries(OBJECTS)) CATALOG.set(k, v)
