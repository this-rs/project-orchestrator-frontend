import { describe, expect, it } from 'vitest'
import { checkSceneV2 } from './sceneV2'

describe('checkSceneV2', () => {
  it('accepts the v2 example (free camera, inline meshes, PBR, texture)', () => {
    const example = {
      version: '2',
      title: 'Plan métallique texturé',
      camera: { kind: 'perspective', position: [3.2, -2.6, 2.4], target: [0, 0, 0.4], fov: 42, near: 0.1, far: 100 },
      lights: [
        { kind: 'directional', color: '#ffffff', intensity: 3, direction: [0.6, -1, 0.8] },
        { kind: 'ambient', color: '#3a4055', intensity: 0.4 },
      ],
      textures: [
        { id: 'checker', kind: 'procedural', procedural: { type: 'checker', colorA: '#dfe3ee', colorB: '#1b1e2b', scale: 8 } },
      ],
      materials: [
        { id: 'metal', baseColor: '#c89a4a', metallic: 0.9, roughness: 0.35 },
        { id: 'sol', baseColor: '#ffffff', baseColorTexture: 'checker', metallic: 0, roughness: 0.8 },
      ],
      nodes: [
        { id: 'dalle', mesh: { positions: [-2, 0, -2, 2, 0, -2, 2, 0, 2, -2, 0, 2], uvs: [0, 0, 1, 0, 1, 1, 0, 1], indices: [0, 1, 2, 0, 2, 3] }, material: 'sol' },
        {
          id: 'cube',
          position: [0, 0, 0.6],
          mesh: {
            positions: [
              -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
              -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
            ],
            uvs: [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1],
            indices: [
              4, 5, 6, 4, 6, 7, 1, 0, 3, 1, 3, 2, 5, 1, 2, 5, 2, 6, 0, 4, 7, 0, 7, 3, 7, 6, 2, 7, 2, 3, 0, 1, 5, 0, 5, 4,
            ],
          },
          material: 'metal',
        },
      ],
    }
    expect(checkSceneV2(example)).toEqual([])
  })

  it('refuses a mesh whose positions are not a multiple of 3', () => {
    const bad = { version: '2', nodes: [{ id: 'm', mesh: { positions: [0, 0, 0, 1, 1], indices: [0, 1, 2] } }] }
    expect(checkSceneV2(bad).length).toBeGreaterThan(0)
  })

  it('refuses an index beyond the vertex count', () => {
    const bad = { version: '2', nodes: [{ id: 'm', mesh: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 9] } }] }
    expect(checkSceneV2(bad).length).toBeGreaterThan(0)
  })

  it('leaves a v1 payload untouched (no v2 fields → no problems)', () => {
    const v1 = { version: '1', title: 'Release', stations: [{ mech: 'drawers', tone: 'green', label: 'Plan' }], build: { mode: 'sequential' } }
    expect(checkSceneV2(v1)).toEqual([])
  })
})
