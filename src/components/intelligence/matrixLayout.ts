/**
 * Noyau pur de la matrice d'adjacence du graphe de connaissances.
 *
 * Agrège des liens entre nœuds en liens entre GROUPES (communautés, ou
 * répertoires en repli), puis les range dans une matrice triangulaire
 * supérieure. Les groupes sont ordonnés de façon déterministe (taille
 * décroissante, puis id croissant) pour que les communautés apparaissent en
 * blocs le long de la diagonale.
 *
 * Aucune dépendance UI, aucun `three` : uniquement des fonctions pures.
 */

/** Identifiant du groupe qui reçoit les nœuds sans groupe. */
export const UNGROUPED_ID = 'ungrouped'
/** Libellé lisible du groupe `ungrouped`. */
export const UNGROUPED_LABEL = 'Sans groupe'

/** Nœud d'entrée : seul son groupe compte pour la matrice. */
export interface MatrixNode {
  id: string
  /** Communauté ou répertoire ; absent/null/vide ⇒ groupe `ungrouped`. */
  group?: string | null
  /** Libellé du groupe, pris sur le premier nœud (dans l'ordre d'id) qui en porte un. */
  label?: string
}

/** Lien d'entrée entre deux nœuds. */
export interface MatrixLink {
  source: string
  target: string
  /** Famille de relation (CO_CHANGED, AFFECTS, DISCUSSED…). */
  relation?: string | null
  /** Multiplicité du lien ; absent ⇒ 1. Entier positif, number ou bigint. */
  count?: number | bigint
}

export interface MatrixGroup {
  /** Identifiant stable du groupe (communauté, ou répertoire en repli). */
  id: string
  label: string
  /** Nombre de nœuds du groupe. */
  size: number
}

export interface MatrixCell {
  /** Indice de ligne dans `groups` (toujours ≤ `col`). */
  row: number
  /** Indice de colonne dans `groups`. */
  col: number
  /** Nombre EXACT de relations entre les deux groupes. */
  count: bigint
  /** Vrai pour la diagonale (relations internes au groupe). */
  self: boolean
}

export interface MatrixLayout {
  groups: MatrixGroup[]
  /** Cellules non vides uniquement, triées par (row, col). */
  cells: MatrixCell[]
  /** Le plus grand compte, pour l'échelle de couleur (0n si aucune cellule). */
  max: bigint
  /** Somme exacte des cellules. */
  total: bigint
  /** Liens ignorés car une extrémité est absente de `nodes`. */
  droppedLinks: number
  /** Liens ignorés car leur `count` n'est pas un entier strictement positif. */
  invalidLinks: number
}

export interface MatrixOptions {
  /** Familles de relations à garder ; toutes si absent. Un lien sans relation est alors écarté. */
  relations?: readonly string[]
}

/** Convertit un `count` en bigint, ou `null` s'il n'est pas un entier > 0. */
function toCount(raw: number | bigint | undefined): bigint | null {
  if (raw === undefined) return 1n
  if (typeof raw === 'bigint') return raw > 0n ? raw : null
  if (!Number.isInteger(raw) || raw <= 0) return null
  return BigInt(raw)
}

/** Comparaison de chaînes indépendante de la locale (déterministe). */
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Construit la matrice d'adjacence entre groupes.
 *
 * - Ordre des groupes : taille décroissante, puis id croissant (jamais l'ordre d'entrée).
 * - Triangulaire supérieure : pour i≠j une seule cellule `(min, max)`.
 * - Comptes exacts en bigint ; aucune cellule sans relation réelle.
 * - Extrémité inconnue ⇒ lien ignoré et compté dans `droppedLinks`.
 */
export function buildMatrix(
  nodes: readonly MatrixNode[],
  links: readonly MatrixLink[],
  options: MatrixOptions = {},
): MatrixLayout {
  // Nœud → groupe. En cas d'id dupliqué, le premier rencontré gagne
  // (seul cas où l'ordre d'entrée compte, et il n'affecte pas les ids distincts).
  const groupOfNode = new Map<string, string>()
  const sizes = new Map<string, number>()
  const labels = new Map<string, { nodeId: string; label: string }>()
  for (const n of nodes) {
    if (groupOfNode.has(n.id)) continue
    const g = n.group ? n.group : UNGROUPED_ID
    groupOfNode.set(n.id, g)
    sizes.set(g, (sizes.get(g) ?? 0) + 1)
    // Libellé : indépendant de l'ordre d'entrée (plus petit id de nœud qui en porte un).
    if (n.label) {
      const cur = labels.get(g)
      if (!cur || cmp(n.id, cur.nodeId) < 0) labels.set(g, { nodeId: n.id, label: n.label })
    }
  }

  const groups: MatrixGroup[] = [...sizes.entries()]
    .map(([id, size]) => ({
      id,
      size,
      label: id === UNGROUPED_ID ? UNGROUPED_LABEL : (labels.get(id)?.label ?? id),
    }))
    .sort((a, b) => b.size - a.size || cmp(a.id, b.id))

  const index = new Map<string, number>()
  groups.forEach((g, i) => index.set(g.id, i))

  const keep = options.relations ? new Set(options.relations) : null
  const acc = new Map<string, MatrixCell>()
  let dropped = 0
  let invalid = 0

  for (const l of links) {
    if (keep && !(l.relation != null && keep.has(l.relation))) continue
    const gs = groupOfNode.get(l.source)
    const gt = groupOfNode.get(l.target)
    if (gs === undefined || gt === undefined) {
      dropped++
      continue
    }
    const c = toCount(l.count)
    if (c === null) {
      invalid++
      continue
    }
    const a = index.get(gs)!
    const b = index.get(gt)!
    const row = Math.min(a, b)
    const col = Math.max(a, b)
    const key = `${row}:${col}`
    const cell = acc.get(key)
    if (cell) cell.count += c
    else acc.set(key, { row, col, count: c, self: row === col })
  }

  const cells = [...acc.values()].sort((x, y) => x.row - y.row || x.col - y.col)
  let max = 0n
  let total = 0n
  for (const c of cells) {
    total += c.count
    if (c.count > max) max = c.count
  }
  return { groups, cells, max, total, droppedLinks: dropped, invalidLinks: invalid }
}
