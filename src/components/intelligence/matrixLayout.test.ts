import { describe, it, expect } from 'vitest'
import { buildMatrix, type MatrixLink, type MatrixNode } from './matrixLayout'

const n = (id: string, group?: string | null): MatrixNode => ({ id, group })
const l = (source: string, target: string, relation?: string, count?: number | bigint): MatrixLink => ({
  source,
  target,
  relation,
  count,
})

// A (3 nœuds) plus gros que B (2 nœuds) ⇒ A en 0, B en 1.
const nodes = [n('a1', 'A'), n('a2', 'A'), n('a3', 'A'), n('b1', 'B'), n('b2', 'B')]

describe('buildMatrix', () => {
  it('deux communautés séparées : deux blocs diagonaux et une cellule croisée', () => {
    const m = buildMatrix(nodes, [l('a1', 'a2'), l('a2', 'a3'), l('b1', 'b2'), l('a1', 'b1')])
    expect(m.groups.map((g) => g.id)).toEqual(['A', 'B'])
    expect(m.cells).toEqual([
      { row: 0, col: 0, count: 2n, self: true },
      { row: 0, col: 1, count: 1n, self: false },
      { row: 1, col: 1, count: 1n, self: true },
    ])
  })

  it('ordre déterministe : entrée mélangée ⇒ sortie identique', () => {
    const links = [l('a1', 'a2'), l('b1', 'b2'), l('a1', 'b1'), l('b2', 'a3', 'X', 4n)]
    const ref = buildMatrix(nodes, links)
    const shuffled = buildMatrix([...nodes].reverse(), [...links].reverse())
    expect(shuffled.groups).toEqual(ref.groups)
    expect(shuffled.cells).toEqual(ref.cells)
    // Égalité de taille ⇒ id croissant.
    const tie = buildMatrix([n('1', 'z'), n('2', 'a')], [])
    expect(tie.groups.map((g) => g.id)).toEqual(['a', 'z'])
  })

  it('aucune cellule pour une paire sans relation', () => {
    const m = buildMatrix(nodes, [l('a1', 'a2')])
    expect(m.cells).toHaveLength(1)
    expect(m.cells.some((c) => c.row === 0 && c.col === 1)).toBe(false)
    expect(m.cells.some((c) => c.row === 1 && c.col === 1)).toBe(false)
  })

  it('triangularité : jamais de cellule row > col, une seule cellule par paire', () => {
    const m = buildMatrix(nodes, [l('a1', 'b1'), l('b1', 'a1'), l('b2', 'a2')])
    expect(m.cells.every((c) => c.row <= c.col)).toBe(true)
    expect(m.cells).toEqual([{ row: 0, col: 1, count: 3n, self: false }])
  })

  it('comptes exacts et total = somme des cellules (count fourni + liens unitaires)', () => {
    const m = buildMatrix(nodes, [l('a1', 'a2'), l('a1', 'a3', 'R', 5), l('a2', 'b1', 'R', 7n), l('b1', 'b2')])
    expect(m.cells.find((c) => c.row === 0 && c.col === 0)?.count).toBe(6n)
    expect(m.cells.find((c) => c.row === 0 && c.col === 1)?.count).toBe(7n)
    expect(m.cells.find((c) => c.row === 1 && c.col === 1)?.count).toBe(1n)
    expect(m.total).toBe(14n)
    expect(m.total).toBe(m.cells.reduce((s, c) => s + c.count, 0n))
    expect(m.max).toBe(7n)
  })

  it('grandeur : 10^12 relations en un seul lien restent exactes', () => {
    const big = 10n ** 12n
    const m = buildMatrix(nodes, [l('a1', 'a2', 'CO_CHANGED', big), l('a1', 'a3')])
    expect(m.max).toBe(big + 1n)
    expect(m.total).toBe(big + 1n)
    const m2 = buildMatrix(nodes, [l('a1', 'a2', 'CO_CHANGED', big)])
    expect(m2.max).toBe(big)
    expect(m2.total).toBe(big)
  })

  it('filtre relations : ne garde que CO_CHANGED', () => {
    const links = [
      l('a1', 'a2', 'CO_CHANGED', 3),
      l('a1', 'b1', 'AFFECTS', 10),
      l('b1', 'b2', 'DISCUSSED'),
      l('a2', 'a3'),
    ]
    const all = buildMatrix(nodes, links)
    expect(all.cells).toHaveLength(3)
    const f = buildMatrix(nodes, links, { relations: ['CO_CHANGED'] })
    expect(f.cells).toEqual([{ row: 0, col: 0, count: 3n, self: true }])
    expect(f.total).toBe(3n)
    expect(f.droppedLinks).toBe(0)
  })

  it('nœud sans groupe ⇒ groupe ungrouped présent, relations comptées', () => {
    const m = buildMatrix([n('x'), n('y', null), n('a1', 'A')], [l('x', 'y'), l('x', 'a1')])
    const u = m.groups.findIndex((g) => g.id === 'ungrouped')
    expect(u).toBeGreaterThanOrEqual(0)
    expect(m.groups[u].size).toBe(2)
    expect(m.groups[u].label.length).toBeGreaterThan(0)
    expect(m.total).toBe(2n)
    expect(m.cells.find((c) => c.row === u && c.col === u)?.count).toBe(1n)
  })

  it('lien vers un id inconnu ⇒ ignoré, droppedLinks incrémenté, aucune cellule fantôme', () => {
    const m = buildMatrix(nodes, [l('a1', 'ghost'), l('ghost', 'b1'), l('a1', 'a2')])
    expect(m.droppedLinks).toBe(2)
    expect(m.groups.map((g) => g.id)).toEqual(['A', 'B'])
    expect(m.cells).toEqual([{ row: 0, col: 0, count: 1n, self: true }])
    expect(m.total).toBe(1n)
  })

  it('count invalide (0, négatif, fractionnaire) : ignoré et compté dans invalidLinks', () => {
    const m = buildMatrix(nodes, [l('a1', 'a2', 'R', 0), l('a1', 'a2', 'R', -2), l('a1', 'a2', 'R', 1.5)])
    expect(m.invalidLinks).toBe(3)
    expect(m.cells).toEqual([])
    expect(m.max).toBe(0n)
  })
})
