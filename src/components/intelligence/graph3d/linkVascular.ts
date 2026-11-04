/**
 * Géométrie pure des liens « vasculaires » du graphe 3D.
 *
 * Uniquement des tableaux de nombres : aucun import de `three`, aucun WebGL.
 * Tout est déterministe (pas d'aléa, pas d'horloge) et sans NaN / Infinity,
 * même sur des entrées dégénérées (points confondus, courbe rectiligne,
 * `samples` = 2, tableau vide).
 */

export type Vec3 = [number, number, number]

/** Repère orthonormé le long d'une courbe, sans torsion parasite. */
export interface Frame {
  position: Vec3
  tangent: Vec3
  normal: Vec3
  binormal: Vec3
}

/** En dessous de cette norme, un vecteur est jugé nul (dégénéré). */
const EPS = 1e-12

// ── Petites opérations vectorielles (internes) ────────────────────────────

/** Remplace tout composant non fini par 0 : barrière anti-NaN en entrée. */
function clean(v: Vec3): Vec3 {
  return [
    Number.isFinite(v[0]) ? v[0] : 0,
    Number.isFinite(v[1]) ? v[1] : 0,
    Number.isFinite(v[2]) ? v[2] : 0,
  ]
}
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const norm = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])

/** Normalise `a` ; renvoie `null` si sa norme est (quasi) nulle. */
function unit(a: Vec3): Vec3 | null {
  const n = norm(a)
  return n > EPS && Number.isFinite(n) ? scale(a, 1 / n) : null
}

/**
 * Projette `v` sur le plan perpendiculaire au tangent unitaire `t`
 * et normalise ; `null` si `v` est (quasi) colinéaire à `t`.
 */
function perpendicular(v: Vec3, t: Vec3): Vec3 | null {
  return unit(sub(v, scale(t, dot(v, t))))
}

/**
 * Un vecteur unitaire perpendiculaire à `t` (unitaire), choisi
 * déterministiquement : l'axe du monde le moins aligné avec `t`.
 */
function anyPerpendicular(t: Vec3): Vec3 {
  const ax = Math.abs(t[0])
  const ay = Math.abs(t[1])
  const az = Math.abs(t[2])
  const axis: Vec3 = ax <= ay && ax <= az ? [1, 0, 0] : ay <= az ? [0, 1, 0] : [0, 0, 1]
  // Les trois axes ne peuvent pas être tous colinéaires à t : le repli ne sert qu'à typer.
  return perpendicular(axis, t) ?? [0, 1, 0]
}

// ── Spline ────────────────────────────────────────────────────────────────

/**
 * Courbe de Bézier cubique échantillonnée en `samples` points, extrémités
 * incluses (paramètre t = i/(samples-1), pas uniforme en t).
 * `samples` est ramené à un entier ≥ 2 : on a toujours au moins les deux bouts.
 * B(t) = (1-t)³·P0 + 3(1-t)²t·P1 + 3(1-t)t²·P2 + t³·P3.
 */
export function cubicSpline(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, samples: number): Vec3[] {
  const n = Number.isFinite(samples) ? Math.max(2, Math.floor(samples)) : 2
  const a = clean(p0)
  const b = clean(p1)
  const c = clean(p2)
  const d = clean(p3)
  const out: Vec3[] = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const u = 1 - t
    const w0 = u * u * u
    const w1 = 3 * u * u * t
    const w2 = 3 * u * t * t
    const w3 = t * t * t
    out.push([
      w0 * a[0] + w1 * b[0] + w2 * c[0] + w3 * d[0],
      w0 * a[1] + w1 * b[1] + w2 * c[1] + w3 * d[1],
      w0 * a[2] + w1 * b[2] + w2 * c[2] + w3 * d[2],
    ])
  }
  return out
}

// ── Repères à transport parallèle ─────────────────────────────────────────

/**
 * Repères à TRANSPORT PARALLÈLE le long d'une suite de points.
 *
 * Tangent : différence centrale (avant/arrière aux bouts). Un tangent nul
 * (points confondus) hérite du dernier tangent valide ; si toute la courbe est
 * dégénérée, on prend +Z. Les repères restent donc définis partout.
 *
 * Normale initiale : `upHint` (défaut +Y) projeté perpendiculairement au premier
 * tangent ; s'il lui est colinéaire, on prend un axe du monde quelconque mais
 * déterministe (`anyPerpendicular`).
 *
 * Propagation (le cœur anti-demi-tour) : la normale du point i est celle du
 * point i-1 reprojetée perpendiculairement au NOUVEAU tangent, puis normalisée.
 * Elle ne dépend d'aucun « up » global : quand la courbe passe par la verticale,
 * un calcul naïf « up − (up·t)t » voit son signe basculer d'un coup (la normale
 * se retourne de ~π) ; ici la normale ne bouge que de l'angle dont le tangent
 * a tourné. Cas pathologique : si la normale précédente devient colinéaire au
 * nouveau tangent (virage à 90° d'un seul pas), on se rabat sur la binormale
 * précédente reprojetée, puis sur un axe quelconque.
 *
 * Binormale = tangent × normale. Le triplet (t, n, b) est orthonormé et direct :
 * t·(n×b) = +1.
 */
export function parallelTransportFrames(points: Vec3[], upHint: Vec3 = [0, 1, 0]): Frame[] {
  const pts = points.map(clean)
  const count = pts.length
  if (count === 0) return []

  // 1. Tangents bruts, avec repli sur le dernier tangent valide.
  const tangents: (Vec3 | null)[] = pts.map((_, i) => {
    const prev = pts[Math.max(0, i - 1)]
    const next = pts[Math.min(count - 1, i + 1)]
    return unit(sub(next, prev))
  })
  let last: Vec3 | null = null
  for (let i = 0; i < count; i++) {
    if (tangents[i]) last = tangents[i]
    else tangents[i] = last
  }
  last = null
  for (let i = count - 1; i >= 0; i--) {
    if (tangents[i]) last = tangents[i]
    else tangents[i] = last
  }
  const ts: Vec3[] = tangents.map((t) => t ?? [0, 0, 1])

  // 2. Repère initial.
  const hint = clean(upHint)
  let normal = perpendicular(hint, ts[0]) ?? anyPerpendicular(ts[0])
  let binormal = cross(ts[0], normal)

  const frames: Frame[] = []
  for (let i = 0; i < count; i++) {
    const t = ts[i]
    if (i > 0) {
      // 3. Transport : reprojection de la normale précédente sur le plan ⟂ t.
      const next = perpendicular(normal, t) ?? perpendicular(binormal, t) ?? anyPerpendicular(t)
      normal = next
      binormal = cross(t, normal)
    }
    frames.push({
      position: pts[i],
      tangent: t,
      normal: [...normal] as Vec3,
      binormal: [...binormal] as Vec3,
    })
  }
  return frames
}

// ── Sections ──────────────────────────────────────────────────────────────

/**
 * Section d'un conduit : anneau de `segments` points (au moins 3) autour du
 * repère, dans le plan (normale, binormale), donc perpendiculaire au tangent.
 * Elliptique : demi-axe `radiusNormal` le long de la normale, `radiusBinormal`
 * le long de la binormale. Le point k est à l'angle `phase + 2πk/segments`,
 * dans le sens normale → binormale, c'est-à-dire direct autour du tangent
 * (n × b = t). Rayons : valeur absolue, non finis ramenés à 0.
 */
export function sectionRing(
  frame: Frame,
  radiusNormal: number,
  radiusBinormal: number,
  segments: number,
  phase: number,
): Vec3[] {
  const n = Number.isFinite(segments) ? Math.max(3, Math.floor(segments)) : 3
  const rn = Number.isFinite(radiusNormal) ? Math.abs(radiusNormal) : 0
  const rb = Number.isFinite(radiusBinormal) ? Math.abs(radiusBinormal) : 0
  const ph = Number.isFinite(phase) ? phase : 0
  const out: Vec3[] = []
  for (let k = 0; k < n; k++) {
    const a = ph + (2 * Math.PI * k) / n
    const c = rn * Math.cos(a)
    const s = rb * Math.sin(a)
    out.push([
      frame.position[0] + c * frame.normal[0] + s * frame.binormal[0],
      frame.position[1] + c * frame.normal[1] + s * frame.binormal[1],
      frame.position[2] + c * frame.normal[2] + s * frame.binormal[2],
    ])
  }
  return out
}

// ── Faisceau tressé ───────────────────────────────────────────────────────

/**
 * Décalages d'un faisceau TRESSÉ, indexés `[brin][échantillon]`.
 *
 * Chaque décalage est exprimé dans le plan de section : `[selon normale,
 * selon binormale, 0]` (à appliquer avec le repère local de l'échantillon).
 * Le brin k part de l'angle 2πk/strands et tourne de `turns` tours complets
 * sur toute la longueur : l'angle au point i vaut 2πk/strands + 2π·turns·i/(samples-1).
 * Les brins, équirépartis sur un cercle de rayon `amplitude`, passent donc
 * alternativement devant/derrière et s'entrecroisent sans jamais se confondre
 * (à un instant donné ils restent espacés de 2πk/strands).
 *
 * Barycentre : à chaque échantillon la somme des brins est nulle (symétrie du
 * cercle pour strands ≥ 2) ; on soustrait en plus la moyenne résiduelle pour
 * garantir l'axe du conduit non déformé à l'arrondi flottant près.
 * Un seul brin = l'axe lui-même : décalage nul. Paramètres invalides → zéros.
 */
export function braidedOffsets(
  strands: number,
  samples: number,
  turns: number,
  amplitude: number,
): Vec3[][] {
  const s = Number.isFinite(strands) ? Math.max(0, Math.floor(strands)) : 0
  const m = Number.isFinite(samples) ? Math.max(0, Math.floor(samples)) : 0
  const tr = Number.isFinite(turns) ? turns : 0
  const amp = Number.isFinite(amplitude) ? amplitude : 0
  const out: Vec3[][] = Array.from({ length: s }, () => new Array<Vec3>(m))
  if (s === 0 || m === 0) return out

  for (let i = 0; i < m; i++) {
    const u = m > 1 ? i / (m - 1) : 0
    let mx = 0
    let my = 0
    const row: Vec3[] = []
    for (let k = 0; k < s; k++) {
      const a = (2 * Math.PI * k) / s + 2 * Math.PI * tr * u
      const v: Vec3 = s === 1 ? [0, 0, 0] : [amp * Math.cos(a), amp * Math.sin(a), 0]
      row.push(v)
      mx += v[0]
      my += v[1]
    }
    mx /= s
    my /= s
    for (let k = 0; k < s; k++) {
      out[k][i] = [row[k][0] - mx, row[k][1] - my, 0]
    }
  }
  return out
}

// ── Longueurs ─────────────────────────────────────────────────────────────

/**
 * Longueur cumulée le long d'une polyligne : `[0, d01, d01+d12, …]`, même
 * taille que `points`. Vide → vide ; un seul point → `[0]`. Strictement
 * croissante si les points consécutifs sont distincts.
 */
export function arcLengths(points: Vec3[]): number[] {
  const out: number[] = []
  let acc = 0
  for (let i = 0; i < points.length; i++) {
    if (i > 0) acc += norm(sub(clean(points[i]), clean(points[i - 1])))
    out.push(acc)
  }
  return out
}
