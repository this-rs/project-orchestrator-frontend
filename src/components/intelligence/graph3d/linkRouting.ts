// ============================================================================
// linkRouting — corridors « organiques » mutualisés entre deux ensembles
// ============================================================================
//
// Brief client (03/11/2026) : les liens entre deux mêmes ensembles doivent
// partager un même « corridor » vasculaire au lieu d'être dessinés en mille
// traits parallèles, SANS jamais inventer de connexion qui n'existe pas, et en
// gardant chaque famille de relations comptée séparément.
//
// Trois règles dures, tenues ici :
//
//   1. AUCUN CORRIDOR INVENTÉ. Un corridor n'existe que si au moins un lien
//      réel relie ses deux extrémités. On regroupe des liens existants, on ne
//      fabrique jamais de corridor « pour faire joli ».
//
//   2. AUCUNE PERTE DE COMPTE. Chaque lien contribue exactement 1 à la famille
//      de son type de relation ; un lien sans type atterrit dans la famille
//      explicite UNKNOWN_RELATION. La somme bigint des familles égale toujours
//      le compte exact du corridor.
//
//   3. DÉTERMINISME. La clé d'un corridor est indépendante de l'ordre des
//      extrémités (a→b = b→a, via communityPairKey), les corridors sortent
//      triés par clé, les familles par nom : le résultat ne dépend pas de
//      l'ordre d'entrée des liens.
//
// Tout est pur (aucun THREE, aucun aléa, aucun état de module) : le module est
// testable sans GPU.
// ============================================================================

import type { Graph3DLink } from './useGraph3DLayout'
import { describeMagnitude, type Magnitude } from './linkMagnitude'
import { communityPairKey, communityToken } from './linkRibbon'

/** Nom de la famille explicite des liens sans type de relation. */
export const UNKNOWN_RELATION = 'UNKNOWN'

/** Une famille de relations à l'intérieur d'un corridor. */
export interface CorridorFamily {
  /** Type de relation réel (IMPORTS, CALLS, CO_CHANGED…). */
  relation: string
  /** Nombre exact de relations de cette famille dans ce corridor. */
  exactCount: bigint
  /** Part du corridor, 0..1 (calculée en bigint puis convertie). */
  share: number
}

/** Un corridor : un chemin partagé entre deux ensembles, et ce qu'il transporte. */
export interface Corridor {
  /** Clé stable et indépendante de l'ordre des extrémités. */
  key: string
  /** Les deux extrémités réelles (ids de groupe/communauté). */
  from: string
  to: string
  /** Toutes les familles transportées, triées par nom. */
  families: CorridorFamily[]
  /** Somme exacte du corridor. */
  magnitude: Magnitude
  /** Les liens réels résumés (jamais inventés). */
  links: Graph3DLink[]
}

// ---------------------------------------------------------------------------
// Fractions exactes en bigint — la « part » d'une famille
// ---------------------------------------------------------------------------

/**
 * Nombre de décimales gardées pour la `share` d'une famille. Choisi au-dessous
 * de la précision d'un double (2^53 ≈ 9·10¹⁵) pour que `Number(...)` du quotient
 * mis à l'échelle ne perde aucun chiffre significatif.
 */
const SHARE_SCALE = 10n ** 15n

/**
 * Part `numerator / denominator`, calculée en bigint puis convertie en nombre.
 *
 * Le brief interdit d'accumuler des flottants : chaque part est le quotient
 * EXACT du compte de la famille par le compte du corridor, ramené dans [0, 1].
 * On n'additionne jamais les parts pour retrouver le total — le total est un
 * bigint, les parts ne sont qu'une présentation.
 */
function exactShare(numerator: bigint, denominator: bigint): number {
  if (denominator === 0n) return 0
  return Number((numerator * SHARE_SCALE) / denominator) / Number(SHARE_SCALE)
}

// ---------------------------------------------------------------------------
// Tri déterministe des liens (le résultat ne dépend pas de l'ordre d'entrée)
// ---------------------------------------------------------------------------

/**
 * Clé canonique d'un lien : les champs qui l'identifient réellement.
 *
 * `relationType` vide est normalisé vers UNKNOWN_RELATION (le même lien ne
 * change pas de clé selon qu'on l'a écrit avec un type vide ou absent), et les
 * communautés passent par `communityToken` (même repli 'none' que partout).
 */
function linkSortKey(link: Graph3DLink): string {
  return [
    link.source,
    link.target,
    link.relationType || UNKNOWN_RELATION,
    link.layer,
    communityToken(link.sourceCommunityId),
    communityToken(link.targetCommunityId),
    link.count === undefined ? '' : String(link.count),
    link.weight === undefined ? '' : String(link.weight),
    link.confidence === undefined ? '' : String(link.confidence),
  ].join('\u0000')
}

/**
 * Une copie de `links` triée par clé canonique. Trie-t-on vraiment ? Oui : le
 * brief exige que le résultat soit identique quel que soit l'ordre d'entrée,
 * et la liste `links` du corridor fait partie du résultat. Trier n'invente rien
 * (aucun lien n'est ajouté ni retiré) : cela fixe seulement l'ordre.
 */
function sortLinks(links: readonly Graph3DLink[]): Graph3DLink[] {
  const decorated = links.map((link) => ({ link, key: linkSortKey(link) }))
  decorated.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  return decorated.map((d) => d.link)
}

// ---------------------------------------------------------------------------
// Construction des corridors
// ---------------------------------------------------------------------------

/**
 * Regroupe les liens en corridors mutualisés : un corridor par paire de
 * communautés réellement reliées.
 *
 * - La clé est `communityPairKey(sourceCommunityId, targetCommunityId)`,
 *   indépendante de l'ordre (a→b et b→a donnent le MÊME corridor).
 * - `from`/`to` sont les jetons de communauté triés, donc stables quel que soit
 *   le sens du premier lien rencontré.
 * - Chaque lien contribue exactement 1 à la famille de son `relationType`
 *   (UNKNOWN_RELATION s'il n'en a pas) ; la somme exacte des familles égale le
 *   compte du corridor, porté par `magnitude` via `describeMagnitude`.
 * - Sortie triée par clé : déterministe, indépendante de l'ordre d'entrée.
 *
 * Aucune extrémité sans lien réel ne produit de corridor : on ne fabrique
 * jamais de connexion.
 */
export function buildCorridors(links: readonly Graph3DLink[]): Corridor[] {
  // 1. Regrouper par paire de communautés (ordre-indépendant).
  const groups = new Map<string, Graph3DLink[]>()
  for (const link of links) {
    const key = communityPairKey(link.sourceCommunityId, link.targetCommunityId)
    let group = groups.get(key)
    if (!group) {
      group = []
      groups.set(key, group)
    }
    group.push(link)
  }

  // 2. Construire un corridor par groupe (chaque groupe a ≥ 1 lien réel).
  const corridors: Corridor[] = []
  for (const [key, groupLinks] of groups) {
    // Extrémités : jetons de communauté triés, indépendants du sens du lien.
    const first = groupLinks[0]
    const a = communityToken(first.sourceCommunityId)
    const b = communityToken(first.targetCommunityId)
    const from = a <= b ? a : b
    const to = a <= b ? b : a

    // Familles : chaque lien compte pour 1 dans le type de relation qu'il porte.
    const byRelation = new Map<string, bigint>()
    for (const link of groupLinks) {
      const relation = link.relationType || UNKNOWN_RELATION
      byRelation.set(relation, (byRelation.get(relation) ?? 0n) + 1n)
    }
    const total = BigInt(groupLinks.length)
    const entries = [...byRelation.entries()].sort((x, y) =>
      x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0,
    )
    const families: CorridorFamily[] = entries.map(([relation, exactCount]) => ({
      relation,
      exactCount,
      share: exactShare(exactCount, total),
    }))

    corridors.push({
      key,
      from,
      to,
      families,
      magnitude: describeMagnitude(
        total,
        entries.map(([relation, exactCount]) => ({ key: relation, count: exactCount })),
      ),
      links: sortLinks(groupLinks),
    })
  }

  // 3. Tri déterministe par clé.
  corridors.sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0))
  return corridors
}

/**
 * Vrai si les familles d'un corridor forment une partition COMPLÈTE : leur
 * somme exacte égale le compte du corridor.
 *
 * C'est le « aucune perte de compte par agrégation » du brief. Toujours vrai
 * pour un corridor sorti de `buildCorridors` (les familles y sont construites à
 * partir de chaque lien) ; c'est une fonction plutôt qu'un invariant pour que
 * le test puisse le PROUVER et pour qu'un appelant qui a modifié un corridor le
 * re-vérifie.
 */
export function corridorIsComplete(corridor: Corridor): boolean {
  let sum = 0n
  for (const family of corridor.families) sum += family.exactCount
  return sum === corridor.magnitude.exactCount
}
