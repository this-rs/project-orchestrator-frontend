import { describe, expect, it } from 'vitest'
import { PO_ENTITY_COLOR, PO_LAYER_COLOR, entityColor } from './graphPalette'

/**
 * La palette portait deux collisions EXACTES (decision = skill = #e879f9,
 * trait = protocol = #fb7185) : deux entités de familles différentes étaient
 * indiscernables, et rien ne le disait. Une couleur qui apparaît deux fois est
 * un bug, pas un choix — ce test le refuse.
 */
const hexRgb = (hex: string) => {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] as const
}

/** Distance perceptuelle approchée (compromis rouge-moyen, suffisant pour un garde-fou). */
const distance = (a: string, b: string) => {
  const [r1, g1, b1] = hexRgb(a)
  const [r2, g2, b2] = hexRgb(b)
  const rm = (r1 + r2) / 2
  return Math.sqrt((2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2)
}

describe('graphPalette', () => {
  it('aucune couleur d’entité n’est utilisée deux fois', () => {
    const seen = new Map<string, string>()
    const dupes: string[] = []
    for (const [type, hex] of Object.entries(PO_ENTITY_COLOR)) {
      const key = hex.toLowerCase()
      if (seen.has(key)) dupes.push(`${seen.get(key)} = ${type} = ${key}`)
      else seen.set(key, type)
    }
    expect(dupes).toEqual([])
  })

  it('deux entités restent distinguables (distance perceptuelle minimale)', () => {
    const entries = Object.entries(PO_ENTITY_COLOR)
    const tooClose: string[] = []
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const d = distance(entries[i][1], entries[j][1])
        if (d < 60) tooClose.push(`${entries[i][0]} ↔ ${entries[j][0]} (${Math.round(d)})`)
      }
    }
    expect(tooClose).toEqual([])
  })

  it('chaque couleur de couche est distincte', () => {
    expect(new Set(Object.values(PO_LAYER_COLOR).map((c) => c.toLowerCase())).size).toBe(
      Object.values(PO_LAYER_COLOR).length,
    )
  })
})

// ============================================================================
// LA GRAMMAIRE : une famille = une teinte (05/11/2026)
// ----------------------------------------------------------------------------
// Ce que ces tests gardent, et pourquoi ce sont des MESURES et pas des
// intentions : avant ce changement, l'écart ΔE moyen INTRA-famille valait 81 à
// 104, c'est-à-dire qu'une « famille » n'existait pas. La propriété d'une
// palette de familles est une propriété de TEINTE (angle), pas de ΔE : dans une
// famille la teinte est partagée et la CLARTÉ varie ; entre familles la teinte
// change. Un test qui ne mesurerait que ΔE laisserait passer les deux fautes
// inverses (familles éclatées, ou familles indistinguables).
// ============================================================================
import {
  PO_ENTITY_FAMILY,
  PO_FAMILY_COLOR,
  familyColor,
  familyOf,
  type EntityFamily,
} from './graphPalette'
import { ENTITY_FALLBACK_COLOR } from './graphPalette'

/** Teinte en degrés (0–360). */
const hueOf = (hex: string): number => {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d === 0) return 0
  let hDeg: number
  if (max === r) hDeg = 60 * (((g - b) / d) % 6)
  else if (max === g) hDeg = 60 * ((b - r) / d + 2)
  else hDeg = 60 * ((r - g) / d + 4)
  return (hDeg + 360) % 360
}

/** Écart circulaire entre deux teintes. */
const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

const families = Object.keys(PO_FAMILY_COLOR) as EntityFamily[]

describe('grammaire de représentation — une famille, une teinte', () => {
  it('les 5 familles partitionnent exactement les 19 types', () => {
    const types = Object.keys(PO_ENTITY_COLOR) as (keyof typeof PO_ENTITY_COLOR)[]
    expect(types).toHaveLength(19)
    for (const t of types) expect(familyOf(t)).not.toBeNull()
    for (const f of families) {
      expect(types.filter((t) => PO_ENTITY_FAMILY[t] === f).length).toBeGreaterThan(0)
    }
    expect(new Set(families)).toHaveLength(5)
  })

  it('dans une famille, tous les types partagent la même teinte (≤ 14°)', () => {
    for (const f of families) {
      const hues = (Object.keys(PO_ENTITY_COLOR) as (keyof typeof PO_ENTITY_COLOR)[])
        .filter((t) => PO_ENTITY_FAMILY[t] === f)
        .map((t) => hueOf(PO_ENTITY_COLOR[t]))
      const base = hueOf(PO_FAMILY_COLOR[f])
      for (const h of hues) {
        expect(hueGap(h, base), `teinte hors famille ${f}`).toBeLessThanOrEqual(14)
      }
    }
  })

  it('entre deux familles, la teinte change franchement (≥ 35°)', () => {
    for (let i = 0; i < families.length; i++) {
      for (let j = i + 1; j < families.length; j++) {
        const gap = hueGap(hueOf(PO_FAMILY_COLOR[families[i]]), hueOf(PO_FAMILY_COLOR[families[j]]))
        expect(gap, `${families[i]} vs ${families[j]}`).toBeGreaterThanOrEqual(35)
      }
    }
  })

  it('deux types d’une même famille ne partagent jamais la même nuance', () => {
    for (const f of families) {
      const colours = (Object.keys(PO_ENTITY_COLOR) as (keyof typeof PO_ENTITY_COLOR)[])
        .filter((t) => PO_ENTITY_FAMILY[t] === f)
        .map((t) => PO_ENTITY_COLOR[t])
      expect(new Set(colours).size).toBe(colours.length)
    }
  })

  it('familyColor rend la teinte de famille, entityColor la nuance du type', () => {
    expect(familyColor('file')).toBe(PO_FAMILY_COLOR.code)
    expect(familyColor('decision')).toBe(PO_FAMILY_COLOR.savoir)
    expect(entityColor('file')).toBe(PO_ENTITY_COLOR.file)
    expect(entityColor('file')).not.toBe(familyColor('file'))
  })

  it('un type inconnu ne prétend pas appartenir à une famille', () => {
    expect(familyOf('licorn')).toBeNull()
    expect(familyColor('licorn')).toBe(ENTITY_FALLBACK_COLOR)
    expect(entityColor('licorn')).toBe(ENTITY_FALLBACK_COLOR)
  })
})

// ----------------------------------------------------------------------------
// ACCESSIBILITÉ — les 5 teintes de famille survivent à la deutéranopie.
// Critère 5 de la spec, qui n'était gardé par AUCUN test (mesuré le 05/11 :
// aucune occurrence du mot hors du document). Simulation Machado 2009,
// sévérité 1.0, en RGB linéaire, puis ΔE CIE76 : deux familles sous ΔE 14 sont
// indistinguables à ~5 px pour un deutéranope. Mesuré à la main avant d'écrire
// ce test : 0 paire sur 10 sous le seuil.
// ----------------------------------------------------------------------------
const toLinear = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)

const linearRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '')
  return [
    toLinear(parseInt(h.slice(0, 2), 16)),
    toLinear(parseInt(h.slice(2, 4), 16)),
    toLinear(parseInt(h.slice(4, 6), 16)),
  ]
}

const deuteranope = ([r, g, b]: [number, number, number]): [number, number, number] => [
  0.367322 * r + 0.860646 * g - 0.227968 * b,
  0.280085 * r + 0.672501 * g + 0.047413 * b,
  -0.01182 * r + 0.04294 * g + 0.968881 * b,
]

const labOf = ([R, G, B]: [number, number, number]): [number, number, number] => {
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]
}

const deltaE76 = (a: string, b: string) => {
  const A = labOf(deuteranope(linearRgb(a)))
  const B = labOf(deuteranope(linearRgb(b)))
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2])
}

describe('accessibilité — la palette reste lisible en deutéranopie', () => {
  it('les 5 teintes de famille restent à ΔE ≥ 14 l’une de l’autre', () => {
    for (let i = 0; i < families.length; i++) {
      for (let j = i + 1; j < families.length; j++) {
        const d = deltaE76(PO_FAMILY_COLOR[families[i]], PO_FAMILY_COLOR[families[j]])
        expect(d, `${families[i]} vs ${families[j]} sous deutéranopie`).toBeGreaterThanOrEqual(14)
      }
    }
  })
})
