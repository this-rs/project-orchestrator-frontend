import { describe, it, expect } from 'vitest'
import { CHANNEL_EXTENT, MEMBRANE_SKIN, layerSpecs, ringCenterOffset } from './linkVascularRenderer'

/**
 * La membrane est une couche FINE collée à ce qu'elle enveloppe (retour client
 * du 03/11 : « les contours de membrane en halo sont vraiment trop gros »).
 * Deux défauts la rendaient épaisse : des rayons de 1,0 et 1,45 autour d'un
 * contenu qui s'arrête à 0,68, et un déport de tresse multiplié par le rayon de
 * chaque couche, qui décentrait le halo de son contenu.
 */
describe('membrane vasculaire', () => {
  const specs = layerSpecs(5)
  const membrane = specs.filter((s) => s.kind === 'halo' || s.kind === 'sheath' || s.kind === 'structure')
  const channels = specs.filter((s) => s.kind === 'channel')

  it('enveloppe tout le contenu, sans le dépasser de plus de deux peaux', () => {
    for (const m of membrane) {
      expect(m.radius).toBeGreaterThanOrEqual(CHANNEL_EXTENT - 1e-9)
      expect(m.radius - CHANNEL_EXTENT).toBeLessThanOrEqual(2 * MEMBRANE_SKIN + 1e-9)
    }
    // Une peau reste fine devant le conduit lui-même.
    expect(MEMBRANE_SKIN).toBeLessThan(0.1)
  })

  it('garde les canaux à l\'intérieur de la gaine, quel que soit leur angle', () => {
    const sheath = specs.find((s) => s.kind === 'sheath')!
    const thickness = 3
    for (const ch of channels) {
      for (let k = 0; k <= 20; k++) {
        const u = k / 20
        const [x, y] = ringCenterOffset(ch, [0, 0], thickness, channels.length, u)
        expect(Math.hypot(x, y) + ch.radius * thickness).toBeLessThanOrEqual(sheath.radius * thickness + 1e-9)
      }
    }
  })

  it('centre toutes les couches de membrane et le cœur sur le MÊME axe de tresse', () => {
    const braid: [number, number] = [0.9, -0.6]
    const thickness = 2.5
    const core = specs.find((s) => s.kind === 'core')!
    const ref = ringCenterOffset(core, braid, thickness, channels.length, 0.3)
    for (const m of membrane) {
      const c = ringCenterOffset(m, braid, thickness, channels.length, 0.3)
      expect(c[0]).toBeCloseTo(ref[0], 9)
      expect(c[1]).toBeCloseTo(ref[1], 9)
    }
    // Et ce centre suit l'épaisseur, pas le rayon propre de la couche.
    expect(ref[0]).toBeCloseTo(braid[0] * thickness, 9)
  })
})
