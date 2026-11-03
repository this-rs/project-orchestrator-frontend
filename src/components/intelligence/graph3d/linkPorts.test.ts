import { describe, it, expect } from 'vitest'
import { DEFAULT_PORT_OPTIONS, distributePorts, type GroupEnvelope, type GroupPair } from './linkPorts'

const g = (id: string, x: number, y: number, z: number, radius = 100): GroupEnvelope => ({
  id,
  center: [x, y, z],
  radius,
})

/** Six groupes sur un cercle, comme dans la capture client. */
const RING: GroupEnvelope[] = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2
  return g(`g${i}`, Math.cos(a) * 240, Math.sin(a) * 240, 0)
})

const PAIRS: GroupPair[] = []
for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) PAIRS.push({ key: `g${i}|g${j}`, from: `g${i}`, to: `g${j}` })

describe('ports distribués', () => {
  it('pose chaque port SUR l’enveloppe du groupe, jamais à son centre', () => {
    const { ports } = distributePorts(RING, PAIRS)
    expect(ports.length).toBeGreaterThan(6)
    for (const port of ports) {
      const group = RING.find((x) => x.id === port.group)!
      const d = Math.hypot(
        port.position[0] - group.center[0],
        port.position[1] - group.center[1],
        port.position[2] - group.center[2],
      )
      expect(d).toBeCloseTo(group.radius * 0.85, 6)
    }
  })

  it('ouvre PLUSIEURS ports par groupe — le défaut d’origine était un seul moyeu', () => {
    const { ports } = distributePorts(RING, PAIRS)
    const perGroup = new Map<string, number>()
    for (const p of ports) perGroup.set(p.group, (perGroup.get(p.group) ?? 0) + 1)
    // Un groupe du centre du graphe touche cinq voisins : il doit avoir
    // plusieurs entrées, pas un point unique.
    for (const [, count] of perGroup) expect(count).toBeGreaterThan(1)
  })

  it('sépare angulairement les ports d’un même groupe', () => {
    const { ports } = distributePorts(RING, PAIRS)
    const byGroup = new Map<string, typeof ports>()
    for (const p of ports) byGroup.set(p.group, [...(byGroup.get(p.group) ?? []), p])
    for (const [, list] of byGroup) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const d =
            list[i].direction[0] * list[j].direction[0] +
            list[i].direction[1] * list[j].direction[1] +
            list[i].direction[2] * list[j].direction[2]
          // Deux ports distincts sont au moins à minAngle l'un de l'autre.
          expect(Math.acos(Math.max(-1, Math.min(1, d)))).toBeGreaterThanOrEqual(
            DEFAULT_PORT_OPTIONS.minAngle - 1e-9,
          )
        }
      }
    }
  })

  it('respecte le plafond de ports par groupe', () => {
    const { ports } = distributePorts(RING, PAIRS, { maxPortsPerGroup: 3 })
    const perGroup = new Map<string, number>()
    for (const p of ports) perGroup.set(p.group, (perGroup.get(p.group) ?? 0) + 1)
    for (const [, count] of perGroup) expect(count).toBeLessThanOrEqual(3)
  })

  it('relie CHAQUE corridor réel à deux ports, et aucun ailleurs', () => {
    const { pairPorts } = distributePorts(RING, PAIRS)
    expect(pairPorts.size).toBe(PAIRS.length)
    for (const pair of PAIRS) {
      const res = pairPorts.get(pair.key)!
      expect(res.from).toMatch(new RegExp(`^port:${pair.from}:`))
      expect(res.to).toMatch(new RegExp(`^port:${pair.to}:`))
    }
  })

  it('ne crée aucun port pour un groupe sans liaison sortante', () => {
    const groups = [...RING, g('isole', 0, 900, 0)]
    const { ports } = distributePorts(groups, PAIRS)
    expect(ports.some((p) => p.group === 'isole')).toBe(false)
  })

  it('ignore une boucle d’un groupe sur lui-même (pas de port sortant)', () => {
    const { ports } = distributePorts(RING, [{ key: 'self', from: 'g0', to: 'g0' }])
    expect(ports).toEqual([])
  })

  it('est déterministe : l’ordre des entrées ne change rien', () => {
    const a = distributePorts(RING, PAIRS)
    const b = distributePorts([...RING].reverse(), [...PAIRS].reverse())
    expect(b.ports.map((p) => p.id).sort()).toEqual(a.ports.map((p) => p.id).sort())
    for (const [k, v] of a.pairPorts) expect(b.pairPorts.get(k)).toEqual(v)
  })

  it('place les ports du côté du voisin qu’ils desservent', () => {
    // Le port de g0 qui dessert g3 (à l'opposé sur le cercle) doit pointer vers
    // l'extérieur, du côté de g3 — pas vers le centre du graphe.
    const { ports, pairPorts } = distributePorts(RING, PAIRS)
    const pair = pairPorts.get('g0|g3')!
    const port = ports.find((p) => p.id === pair.from)!
    const toCenter = [
      RING[3].center[0] - RING[0].center[0],
      RING[3].center[1] - RING[0].center[1],
      RING[3].center[2] - RING[0].center[2],
    ]
    const len = Math.hypot(toCenter[0], toCenter[1], toCenter[2])
    const dot =
      (port.direction[0] * toCenter[0] + port.direction[1] * toCenter[1] + port.direction[2] * toCenter[2]) / len
    expect(dot).toBeGreaterThan(0.5)
  })
})
