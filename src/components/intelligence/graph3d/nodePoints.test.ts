import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  createNodePoints, shapeForType, sizeForType, NODE_MIN_SHAPE_PX, NODE_MIN_SPRITE_PX, NODE_SHAPE_MID_RADIUS, NODE_SHAPE_FRACTION_SMALL, NODE_POINTS_RENDER_ORDER,
  LINK_RENDER_ORDER, LABEL_RENDER_ORDER, nodeSpritePx, shapeGrow,
  densityAlphaK, densityDistanceFactor, DENS_K_MIN, DENS_DIST_MIN, DENS_DIST_FALLBACK_NEAR,
} from './nodePoints'
import { entityColor } from '@/constants/graphPalette'
import { parseColor } from './linkSegments'
import type { Graph3DNode } from './useGraph3DLayout'

const mk = (id: string, x: number, y: number, z: number): Graph3DNode => ({
  id, label: id, entityType: 'file', layer: 'code', x, y, z, data: {},
})

describe('shapeForType', () => {
  it('maps entity types to 4 shapes', () => {
    expect(shapeForType('file')).toBe(0)
    expect(shapeForType('function')).toBe(1)
    expect(shapeForType('decision')).toBe(2)
    expect(shapeForType('plan')).toBe(3)
    expect(shapeForType('unknown')).toBe(0)
  })
})

describe('sizeForType', () => {
  it('gives plans bigger points than functions', () => {
    expect(sizeForType('plan')).toBeGreaterThan(sizeForType('function'))
    expect(sizeForType('function')).toBe(2)
  })
})

describe('createNodePoints', () => {
  const fixture = () => [
    mk('a', 0, 0, 0),
    mk('b', 100, 0, 0),
    mk('c', 0, 100, 0),
  ]

  it('builds one vertex per node', () => {
    const nodes = fixture()
    const np = createNodePoints(nodes)
    expect((np.object.geometry.getAttribute('position') as THREE.BufferAttribute).count).toBe(3)
    np.dispose()
  })

  it('writes node positions', () => {
    const nodes = fixture()
    const np = createNodePoints(nodes)
    const pos = np.object.geometry.getAttribute('position').array as Float32Array
    expect([pos[0], pos[1], pos[2]]).toEqual([0, 0, 0])
    expect([pos[3], pos[4], pos[5]]).toEqual([100, 0, 0])
    np.dispose()
  })

  it('re-reads positions after a node moves', () => {
    const nodes = fixture()
    const np = createNodePoints(nodes)
    nodes[1].x = 250
    np.updatePositions()
    const pos = np.object.geometry.getAttribute('position').array as Float32Array
    expect(pos[3]).toBe(250)
    np.dispose()
  })

  it('writes style attributes per node', () => {
    const nodes = fixture()
    const np = createNodePoints(nodes)
    np.updateStyles((n) => (n.id === 'b'
      ? { r: 1, g: 0, b: 0, alpha: 0.9, size: 5, shape: 1, act: 0.7 }
      : { r: 0, g: 0, b: 1, alpha: 0.5, size: 2, shape: 0, act: 0 }))
    const g = np.object.geometry
    const col = g.getAttribute('aColor').array as Float32Array
    const shp = g.getAttribute('aShape').array as Float32Array
    const act = g.getAttribute('aAct').array as Float32Array
    expect([col[3], col[4], col[5]]).toEqual([1, 0, 0]) // node b
    expect(shp[1]).toBe(1)
    expect(act[1]).toBeCloseTo(0.7, 6)
    expect([col[0], col[1], col[2]]).toEqual([0, 0, 1]) // node a
    np.dispose()
  })

  it('indexes nodes by id', () => {
    const nodes = fixture()
    const np = createNodePoints(nodes)
    expect(np.indexOf('b')).toBe(1)
    expect(np.indexOf('missing')).toBe(-1)
    np.dispose()
  })

  it('updates one node in place via a ranged upload, leaving neighbours untouched', () => {
    const nodes = fixture()
    const np = createNodePoints(nodes)
    np.updateStyles(() => ({ r: 0, g: 0, b: 1, alpha: 0.5, size: 2, shape: 0, act: 0 }))
    const g = np.object.geometry
    // The full restyle reached the GPU (WebGLAttributes calls onUpload after it).
    for (const name of ['aColor', 'aAlpha', 'aSize', 'aShape', 'aAct']) {
      ;(g.getAttribute(name) as THREE.BufferAttribute).onUploadCallback()
    }
    const idx = np.indexOf('b')
    np.updateStyleAt(idx, { r: 1, g: 0, b: 0, alpha: 0.9, size: 5, shape: 1, act: 0.7 })
    const col = g.getAttribute('aColor').array as Float32Array
    const alp = g.getAttribute('aAlpha').array as Float32Array
    const shp = g.getAttribute('aShape').array as Float32Array
    // node b changed
    expect([col[3], col[4], col[5]]).toEqual([1, 0, 0])
    expect(alp[1]).toBeCloseTo(0.9, 6)
    expect(shp[1]).toBe(1)
    // node a untouched
    expect([col[0], col[1], col[2]]).toEqual([0, 0, 1])
    expect(alp[0]).toBeCloseTo(0.5, 6)
    // a ranged upload was queued (element units), not a full-buffer rewrite
    const aColor = g.getAttribute('aColor') as THREE.BufferAttribute
    expect(aColor.updateRanges).toEqual([{ start: 3, count: 3 }])
    np.dispose()
  })

  it('a pending full restyle wins over a later ranged update (three uploads ONLY the ranges)', () => {
    // three r183 WebGLAttributes: a non-empty `updateRanges` uploads those
    // ranges and nothing else. A full updateStyles (dim everything but the
    // selection) followed in the same frame by an updateStyleAt (the pulse /
    // the clicked node) used to upload one vertex: the dimming never reached
    // the GPU — click a node above 2000 nodes, the others stayed lit.
    const np = createNodePoints(fixture())
    const g = np.object.geometry
    for (const name of ['aColor', 'aAlpha', 'aSize', 'aShape', 'aAct']) {
      ;(g.getAttribute(name) as THREE.BufferAttribute).onUploadCallback()
    }
    np.updateStyles(() => ({ r: 0, g: 0, b: 1, alpha: 0.1, size: 2, shape: 0, act: 0 }))
    np.updateStyleAt(np.indexOf('b'), { r: 1, g: 0, b: 0, alpha: 0.9, size: 5, shape: 1, act: 0.7 })
    for (const name of ['aColor', 'aAlpha', 'aSize', 'aShape', 'aAct']) {
      const attr = g.getAttribute(name) as THREE.BufferAttribute
      expect(attr.updateRanges, name).toEqual([])
    }
    // Once uploaded, the next single-vertex update is ranged again.
    for (const name of ['aColor', 'aAlpha', 'aSize', 'aShape', 'aAct']) {
      ;(g.getAttribute(name) as THREE.BufferAttribute).onUploadCallback()
    }
    np.updateStyleAt(np.indexOf('a'), { r: 1, g: 0, b: 0, alpha: 0.9, size: 5, shape: 1, act: 0.7 })
    expect((g.getAttribute('aColor') as THREE.BufferAttribute).updateRanges).toEqual([{ start: 0, count: 3 }])
    np.dispose()
  })

  it('picks the node under the raycaster', () => {
    const nodes = fixture()
    // Camera on +Z looking at the origin so node a (0,0,0) projects to NDC (0,0).
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000)
    camera.position.set(0, 0, 500)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
    const np = createNodePoints(nodes)
    const ray = new THREE.Raycaster()
    ray.params.Points.threshold = 6
    ray.setFromCamera(new THREE.Vector2(0, 0), camera)
    expect(np.pick(ray)?.id).toBe('a')
    // Aim at the far corner: no point there.
    ray.setFromCamera(new THREE.Vector2(0.99, 0.99), camera)
    expect(np.pick(ray)).toBeNull()
    np.dispose()
  })
})

// ── The look, asserted where it can be ───────────────────────────────────────
// A test cannot see a glow. What it CAN pin down is everything that made the
// previous version flat, so a silent revert fails here instead of in the user's
// eyes: the emission, no global gain tied to the node count, a halo that
// reaches the sprite edge, and uPx kept in lockstep with the renderer.


describe('nodePoints material', () => {
  const mat = (n: number) => {
    const np = createNodePoints(Array.from({ length: n }, (_, i) => mk(`n${i}`, i, 0, 0)))
    return { np, material: np.object.material as THREE.ShaderMaterial }
  }

  it('emits light, but overlapping glows keep the brightest instead of summing to white', () => {
    const { np, material } = mat(3)
    // MAX: a dense module stays readable (additive summed it into a white blob)
    expect(material.blending).toBe(THREE.CustomBlending)
    expect(material.blendEquation).toBe(THREE.MaxEquation)
    expect(material.transparent).toBe(true)
    expect(material.depthWrite).toBe(false)
    np.dispose()
  })

  it("no global gain: a node keeps its light however many are drawn", () => {
    // √(400/N) was the additive blending's guard against summing to white. Under
    // MAX blending it only dimmed every node as the detail opened: at 4 000
    // drawn nodes a node lit at 0.32 × the density factor (« peu de visibilité »).
    const { np, material } = mat(10)
    np.setData(Array.from({ length: 4_000 }, (_, i) => mk(`x${i}`, i, 0, 0)))
    expect(material.uniforms.uGlobal).toBeUndefined()
    expect(material.fragmentShader).not.toMatch(/uGlobal/)
    np.dispose()
  })

  it('keeps uPx equal to the renderer pixel ratio it is given', () => {
    const { np, material } = mat(2)
    np.setPixelRatio(1)
    expect(material.uniforms.uPx.value).toBe(1)
    np.setPixelRatio(1.5)
    expect(np.getPixelRatio()).toBe(1.5)
    // Junk must not blank the points (uPx 0 would collapse gl_PointSize).
    np.setPixelRatio(0)
    expect(np.getPixelRatio()).toBe(1)
    np.dispose()
  })

  it('keeps the halo, the core and the per-node alpha in the fragment shader', () => {
    const { np, material } = mat(2)
    const fs = material.fragmentShader
    expect(fs).toContain('uDensK')
    expect(fs).toContain('vAlpha')
    expect(fs).toContain('vAct')
    // halo = q² with q = 1-d²: the smooth radial falloff the flat version lacked
    expect(fs).toMatch(/float halo = q \* q/)
    // the four shapes are still there, each with its own footprint
    expect(fs).toMatch(/vShape < 0\.5/)
    expect(fs).toMatch(/vShape < 1\.5/)
    expect(fs).toMatch(/vShape < 2\.5/)
    np.dispose()
  })

  it('scales gl_PointSize by uPx and by the activation attribute', () => {
    const { np, material } = mat(2)
    expect(material.vertexShader).toContain('gl_PointSize')
    expect(material.vertexShader).toMatch(/uPx/)
    expect(material.vertexShader).toMatch(/aAct \* 1\.2/)
    np.dispose()
  })
})

// --- visibility at 20 000 nodes (no GPU: the shader's maths mirrored in JS) ---

const BG = parseColor('#0f1117')
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const lum = (c: number[]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
const contrast = (a: number[], b: number[]) => {
  const x = lum(a), y = lum(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

describe('minimum on-screen size', () => {
  it('floors the sprite so the visible shape never drops under NODE_MIN_SHAPE_PX', () => {
    for (const uPx of [1, 1.5]) {
      for (const size of [1.5, 2, 4, 6]) {
        // from close up to far beyond the framing distance of a huge graph
        for (const depth of [50, 750, 1500, 3000, 6000, 60_000, 1e6]) {
          const spriteCss = nodeSpritePx(size, depth, uPx) / uPx
          const shapeCss = spriteCss * NODE_SHAPE_MID_RADIUS * shapeGrow(spriteCss)
          expect(spriteCss).toBeGreaterThanOrEqual(NODE_MIN_SPRITE_PX - 1e-9)
          expect(shapeCss).toBeGreaterThanOrEqual(NODE_MIN_SHAPE_PX - 1e-9)
        }
      }
    }
    // The old floor was 2.5 DEVICE px = 1.67 CSS px at uPx 1.5: shape 0.43·1.67 = 0.7 px.
    expect(NODE_MIN_SPRITE_PX * NODE_SHAPE_FRACTION_SMALL).toBeCloseTo(NODE_MIN_SHAPE_PX, 6)
  })

  it('reaches the floor before the node would vanish (commit at 20k-node framing)', () => {
    // R = 1200 → D = R / sin(25°) · 1.06 ≈ 3010; raw size 1.5·0.299·1.5·2 = 1.35 px
    const raw = 1.5 * (900 / 3010) * 1.5 * 2
    expect(raw).toBeLessThan(2)
    expect(nodeSpritePx(1.5, 3010, 1.5) / 1.5).toBeGreaterThanOrEqual(NODE_MIN_SPRITE_PX)
  })

  it('grows the shape inside a small sprite and leaves a large one alone', () => {
    expect(shapeGrow(5.2)).toBeCloseTo(1.6, 6)
    expect(shapeGrow(30)).toBe(1)
    expect(shapeGrow(14)).toBeGreaterThan(1)
    expect(shapeGrow(14)).toBeLessThan(1.6)
  })

  it('wires the floor and the varying into the shaders', () => {
    const np = createNodePoints([])
    const material = np.object.material as THREE.ShaderMaterial
    expect(material.vertexShader).toContain(NODE_MIN_SPRITE_PX.toFixed(3))
    expect(material.vertexShader).toContain('vSprite')
    expect(material.fragmentShader).toContain('vSprite')
    np.dispose()
  })
})

describe('luminance floor at 20 000 nodes', () => {
  it('keeps the dimmest palette colour at >= 3:1 against the canvas', () => {
    // the dimmest the renderer itself makes a node: the density floor (there is
    // no global gain any more, it was 0.3 at 20 000 nodes)
    const gain = DENS_K_MIN
    // disc centre of the fragment shader: m = 1.10, halo = 0.62·0.9, core adds 0.22 white
    const centre = 1.1 + 0.62 * 0.9
    let worst = Infinity
    for (const t of ['file', 'function', 'struct', 'trait', 'step', 'plan', 'task', 'commit', 'milestone', 'decision']) {
      const c = parseColor(entityColor(t))
      const px = [c.r, c.g, c.b].map((v, i) => Math.min(1, [BG.r, BG.g, BG.b][i] + Math.min(4, v * centre + 0.22) * gain))
      worst = Math.min(worst, contrast(px, [BG.r, BG.g, BG.b]))
    }
    expect(worst).toBeGreaterThanOrEqual(3)
  })
})

describe('draw order', () => {
  it('draws the links in front of the nodes they join, labels above everything', () => {
    expect(LINK_RENDER_ORDER).toBeGreaterThan(NODE_POINTS_RENDER_ORDER)
    expect(LABEL_RENDER_ORDER).toBeGreaterThan(LINK_RENDER_ORDER)
    expect(LABEL_RENDER_ORDER).toBeGreaterThan(20) // agent markers
    const np = createNodePoints([])
    expect(np.object.renderOrder).toBe(NODE_POINTS_RENDER_ORDER)
    np.dispose()
  })
})

describe('densityAlphaK (uDensK)', () => {
  const FRAME = 1200 // a representative framing distance, in scene units

  it('is exactly 1 at 1000 nodes or fewer, at any distance and framing', () => {
    for (const n of [0, 1, 500, 1000]) for (const d of [0, 300, FRAME, 1e6]) for (const f of [0, FRAME, 4000]) {
      expect(densityAlphaK(n, d, f)).toBe(1)
    }
  })
  it('drops clearly below 1 but stays >= 0.35 at 20 000 nodes', () => {
    for (const d of [0, 600, FRAME, 5000]) {
      const k = densityAlphaK(20000, d, FRAME)
      expect(k).toBeLessThan(0.9)
      expect(k).toBeGreaterThanOrEqual(DENS_K_MIN)
    }
  })
  it('is monotone non-increasing in the node count and in the distance', () => {
    const counts = [1000, 1500, 3000, 5000, 10000, 20000, 100000]
    for (const d of [0, 500, FRAME]) {
      const ks = counts.map((n) => densityAlphaK(n, d, FRAME))
      for (let i = 1; i < ks.length; i++) expect(ks[i]).toBeLessThanOrEqual(ks[i - 1])
    }
    const dists = [0, 300, 600, 900, FRAME, 4000]
    const kd = dists.map((d) => densityAlphaK(5000, d, FRAME))
    for (let i = 1; i < kd.length; i++) expect(kd[i]).toBeLessThanOrEqual(kd[i - 1])
  })
  it('distance factor is bounded: never 0, never > 1 (including garbage input)', () => {
    for (const d of [-5, 0, 1, FRAME, FRAME * 2, FRAME * 5, 1e9, NaN, Infinity]) {
      const f = densityDistanceFactor(d, FRAME)
      expect(f).toBeGreaterThanOrEqual(DENS_DIST_MIN)
      expect(f).toBeLessThanOrEqual(1)
    }
  })
  it('is exactly 1 at the framing distance and closer, and already < 1 at 3× the framing distance', () => {
    // The client: near things stay sharp — at the framing distance or less the
    // distance factor is 1.0, and it only decays once the camera pulls away.
    for (const d of [0, FRAME * 0.25, FRAME * 0.5, FRAME]) {
      expect(densityDistanceFactor(d, FRAME)).toBe(1)
    }
    const at3x = densityDistanceFactor(FRAME * 3, FRAME)
    expect(at3x).toBeLessThan(1)
    expect(at3x).toBeGreaterThan(0)
  })
  it('falls back to a sensible near bound when the framing distance is not yet known', () => {
    // Before the frame pass, framingDistance is 0/NaN/negative → the fixed fallback.
    expect(densityDistanceFactor(0, 0)).toBe(1)
    expect(densityDistanceFactor(DENS_DIST_FALLBACK_NEAR, 0)).toBe(1)
    expect(densityDistanceFactor(DENS_DIST_FALLBACK_NEAR, NaN)).toBe(1)
    expect(densityDistanceFactor(DENS_DIST_FALLBACK_NEAR * 3, 0)).toBeLessThan(1)
  })
  it('createNodePoints exposes uDensK = 1 for a small graph and updates it from the camera distance', () => {
    const np = createNodePoints([mk('a', 0, 0, 0)])
    const mat = np.object.material as THREE.ShaderMaterial
    expect(mat.uniforms.uDensK.value).toBe(1)
    np.setCameraDistance(5000)
    expect(mat.uniforms.uDensK.value).toBe(1)
    np.dispose()
  })
  it('createNodePoints tracks the framing distance as the near bound of the distance factor', () => {
    const nodes = Array.from({ length: 5000 }, (_, i) => mk('n' + i, i, 0, 0))
    const np = createNodePoints(nodes)
    const mat = np.object.material as THREE.ShaderMaterial
    np.setFramingDistance(100)
    np.setCameraDistance(100) // at the framing distance → factor 1
    expect(mat.uniforms.uDensK.value).toBeCloseTo(densityAlphaK(5000, 100, 100), 6)
    np.setCameraDistance(400) // 4× the framing distance → far, factor < 1
    expect(mat.uniforms.uDensK.value).toBeCloseTo(densityAlphaK(5000, 400, 100), 6)
    np.dispose()
  })
})

describe('nodePoints — setMorph (children flying out of an opened group)', () => {
  it('draws listed nodes between their start and their place, never moving the node objects', () => {
    const nodes = [mk('a', 10, 0, 0), mk('b', 20, 0, 0)]
    const np = createNodePoints(nodes)
    const pos = () => Array.from((np.object.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array)
    const starts = new Map([['a', [0, 0, 0] as [number, number, number]]])
    np.setMorph(starts, 0)
    expect(pos().slice(0, 3)).toEqual([0, 0, 0]) // a at its start
    expect(pos().slice(3, 6)).toEqual([20, 0, 0]) // b untouched
    np.setMorph(starts, 0.5)
    expect(pos()[0]).toBeCloseTo(5)
    np.setMorph(starts, 1)
    expect(pos().slice(0, 3)).toEqual([10, 0, 0])
    expect(nodes[0].x).toBe(10) // the layout's node never moved
    np.dispose()
  })
})
