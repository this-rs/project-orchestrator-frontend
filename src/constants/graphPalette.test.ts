import { describe, expect, it } from 'vitest'
import { PO_ENTITY_COLOR, PO_LAYER_COLOR } from './graphPalette'

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
