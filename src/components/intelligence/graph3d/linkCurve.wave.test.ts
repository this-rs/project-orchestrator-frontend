import { describe, expect, it } from 'vitest'
import { sampleLinkPath, waveOffset } from './linkCurve'

/**
 * L'onde remplace l'arc unique : un lien doit onduler, pas seulement se bomber.
 * Trois propriétés vérifiables sans GPU.
 */
describe('waveOffset', () => {
  it('vaut zéro aux deux extrémités (le lien reste attaché à ses nœuds)', () => {
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      expect(Math.abs(waveOffset(v, 0))).toBeLessThan(1e-9)
      expect(Math.abs(waveOffset(v, 1))).toBeLessThan(1e-9)
    }
  })

  it('l’amplitude croît avec le volume, sans palier', () => {
    // on sonde le MAXIMUM sur le chemin, pas le milieu : selon le nombre de crêtes, t=0,5 tombe sur un nœud de l onde
    const amps = [0, 0.2, 0.4, 0.6, 0.8, 1].map((v) => { let m = 0; for (let i = 0; i <= 200; i++) m = Math.max(m, Math.abs(waveOffset(v, i / 200))); return m })
    for (let i = 1; i < amps.length; i++) expect(amps[i]).toBeGreaterThanOrEqual(amps[i - 1])
    expect(amps[amps.length - 1]).toBeGreaterThan(amps[0])
  })

  it('le nombre de crêtes augmente avec le volume', () => {
    const changes = (v: number) => {
      let n = 0
      let prev = waveOffset(v, 0)
      for (let i = 1; i <= 200; i++) {
        const cur = waveOffset(v, i / 200)
        if (Math.sign(cur) !== Math.sign(prev) && Math.abs(cur - prev) > 1e-9) n++
        prev = cur
      }
      return n
    }
    expect(changes(1)).toBeGreaterThan(changes(0))
  })
})

describe('sampleLinkPath — onde', () => {
  const s = [0, 0, 0] as const
  const t = [100, 0, 0] as const

  it('les extrémités ne bougent pas d’un iota', () => {
    const pts = sampleLinkPath(s, t, 1, 'a', 'b', 33, true)
    // -0 et 0 sont égaux pour l oeil, pas pour Object.is : on compare en valeur
    for (let k = 0; k < 3; k++) { expect(Math.abs(pts[0][k] - k * 0)).toBeLessThan(1e-9) }
    expect(Math.abs(pts[32][0] - 100)).toBeLessThan(1e-9)
    expect(Math.abs(pts[32][1])).toBeLessThan(1e-9)
    expect(Math.abs(pts[32][2])).toBeLessThan(1e-9)
  })

  it('le chemin n’est plus un arc monotone : il change de côté', () => {
    const pts = sampleLinkPath(s, t, 1, 'a', 'b', 129, true)
    const zs = pts.map((p) => p[2])
    const maxZ = Math.max(...zs)
    const minZ = Math.min(...zs)
    // une seule bosse donnerait un z de signe constant ; une onde le traverse
    expect(maxZ).toBeGreaterThan(0)
    expect(minZ).toBeLessThan(0)
  })
})
