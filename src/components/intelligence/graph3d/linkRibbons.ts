// ============================================================================
// linkRibbons — RIBBON links: thick quad bands instead of 1 px threads
// ============================================================================
//
// linkSegments draws every link as ONE LineSegments stroke — a 1 px thread, no
// matter the colour or curve, because WebGL `lineWidth` is ignored on real
// GPUs. This module replaces the stroke with a flat RIBBON: a triangle strip
// sampled along the same Bézier curve (linkCurve.ts), each quad widening the
// line to `ribbonWidth(volume)` world units and carrying the source→target
// colour gradient per vertex (see linkRibbon.ts for the pure planning).
//
// The density regime (detail / bundle / sheet) is chosen by the NUMBER of
// links (selectRibbonRegime) and read off RIBBON_REGIME_PARAMS + the sheet
// aggregation. The arrows (linkArrows.ts) stay a thin LineSegments overlay —
// they are short "V" marks, not design elements — and are positioned exactly
// at 75 % of the SAME curved path the ribbon follows.
//
// Construction failure (bad data, non-finite positions, allocation throw)
// returns null and the caller (createLinkRenderer in linkSegments.ts) falls
// back to the existing LineSegments so the graph never disappears.
// ============================================================================

import * as THREE from 'three'
import type { Graph3DLink, Graph3DNode } from './useGraph3DLayout'
import {
  buildCommunityPairSheets, communityPairKey, communityToken, RIBBON_SUBDIVISIONS,
  RIBBON_REGIME_PARAMS, ribbonIndexCount, ribbonVertexCount, ribbonWidth,
  selectRibbonRegime, sheetAlpha, sheetWidth, type LinkStyle, type LinkStyleFn,
} from './linkRibbon'
import {
  linkVolume, pathPointAndTangent, perpendicular, sampleLinkPath, type Vec3,
} from './linkCurve'
import { classifyLinkScale, interpolateRgb, linkScaleCurvature } from './linkScale'
import { ARROW_ANCHOR, ARROW_VERTICES, arrowsEnabled, computeArrowHeadAt } from './linkArrows'
import { isDirectionalRelation } from './linkFamily'
import { LINK_RENDER_ORDER } from './nodePoints'
import { markFullUpload, markRangeUpload } from './bufferUpload'

/**
 * The unified link renderer — ribbons (this module) or the LineSegments
 * fallback (linkSegments.ts). `object` is a THREE.Group for ribbons (ribbon
 * mesh + arrow overlay) and a THREE.LineSegments for the fallback.
 */
export interface LinkRenderer {
  readonly object: THREE.Object3D
  updatePositions: () => void
  updateColors: (styleFn: LinkStyleFn) => void
  updateColorsForNodes: (nodeIds: readonly string[], styleFn: LinkStyleFn) => void
  dispose: () => void
}

const VERTEX_SHADER = /* glsl */ `
  attribute vec3 aColor;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(vColor, vAlpha);
  }
`

function endpointId(ref: unknown): string {
  if (typeof ref === 'string') return ref
  if (ref && typeof ref === 'object' && typeof (ref as Graph3DNode).id === 'string') {
    return (ref as Graph3DNode).id
  }
  return ''
}

/** Build the ribbon renderer, or null when the data cannot be drawn (fallback). */
export function createLinkRibbons(nodes: Graph3DNode[], links: Graph3DLink[]): LinkRenderer | null {
  try {
    if (!Array.isArray(nodes) || !Array.isArray(links) || links.length === 0) return null
    // Invalid data: any non-finite node position would poison the whole buffer
    // with NaN (and silently vanish on some drivers). Reject → LineSegments.
    for (const n of nodes) {
      if (!Number.isFinite(n.x) || !Number.isFinite(n.y) || !Number.isFinite(n.z)) return null
    }
    return buildRibbons(nodes, links)
  } catch {
    // Allocation failure (memory) or any unexpected error → fall back.
    return null
  }
}

// Per-ribbon metadata — a ribbon is either one link (detail/bundle) or one
// community-pair sheet (sheet). Fields prefixed `src/tgt` are the endpoints'
// node ids (detail/bundle) or empty (sheet), plus the community ids.
interface RibbonMeta {
  repLink: Graph3DLink
  srcId: string
  tgtId: string
  srcComm: number | undefined
  tgtComm: number | undefined
  width: number
  amplitude: number
  count: number
  isSheet: boolean
}

function buildRibbons(nodes: Graph3DNode[], links: Graph3DLink[]): LinkRenderer {
  const regime = selectRibbonRegime(links.length)
  const params = RIBBON_REGIME_PARAMS[regime]
  const isSheet = regime === 'sheet'

  const nodeById = new Map<string, Graph3DNode>()
  for (const n of nodes) nodeById.set(n.id, n)

  const linkScale = (link: Graph3DLink) => {
    const sNode = nodeById.get(endpointId(link.source))
    const tNode = nodeById.get(endpointId(link.target))
    return classifyLinkScale(
      { layer: sNode?.layer ?? link.layer, communityId: sNode?.communityId ?? link.sourceCommunityId },
      { layer: tNode?.layer ?? link.layer, communityId: tNode?.communityId ?? link.targetCommunityId },
    )
  }

  // ── Build the ribbon metadata (one entry per ribbon) ──────────────────
  const meta: RibbonMeta[] = []
  if (isSheet) {
    const sheets = buildCommunityPairSheets(links)
    for (const sheet of sheets) {
      const rep = sheet.links[0]
      meta.push({
        repLink: rep,
        srcId: '', tgtId: '',
        srcComm: sheet.sourceCommunityId,
        tgtComm: sheet.targetCommunityId,
        width: sheetWidth(sheet.count) * params.widthScale,
        amplitude: params.curvatureScale * linkScaleCurvature(linkScale(rep), linkVolume(rep)),
        count: sheet.count,
        isSheet: true,
      })
    }
  } else {
    // bundle: one amplitude PER community pair so the links of a pair bow the
    // same way and overlap into a bundle ("même rayon de courbe").
    let pairAmplitude = new Map<string, number>()
    if (regime === 'bundle') {
      const sheets = buildCommunityPairSheets(links)
      pairAmplitude = new Map<string, number>()
      for (const sheet of sheets) {
        const rep = sheet.links[0]
        pairAmplitude.set(
          sheet.key,
          params.curvatureScale * linkScaleCurvature(linkScale(rep), linkVolume(rep)),
        )
      }
    }
    for (const link of links) {
      const volume = linkVolume(link)
      const amplitude = regime === 'detail'
        ? linkScaleCurvature(linkScale(link), volume)
        : (pairAmplitude.get(communityPairKey(link.sourceCommunityId, link.targetCommunityId)) ?? 0)
      meta.push({
        repLink: link,
        srcId: endpointId(link.source),
        tgtId: endpointId(link.target),
        srcComm: link.sourceCommunityId,
        tgtComm: link.targetCommunityId,
        width: ribbonWidth(volume) * params.widthScale,
        amplitude,
        count: 1,
        isSheet: false,
      })
    }
  }

  const ribbonCount = meta.length
  const vertexCount = ribbonVertexCount(ribbonCount)
  const indexCount = ribbonIndexCount(ribbonCount)

  // ── Geometry (one Mesh, static index buffer) ──────────────────────────
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(vertexCount * 3)
  const colors = new Float32Array(vertexCount * 3)
  const alphas = new Float32Array(vertexCount)
  const indices = new Uint32Array(indexCount)
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))

  // Strip → triangle-list index expansion (static: topology never changes).
  let idx = 0
  for (let r = 0; r < ribbonCount; r++) {
    const base = r * RIBBON_SUBDIVISIONS * 2
    for (let k = 0; k < RIBBON_SUBDIVISIONS - 1; k++) {
      const i0 = base + k * 2
      indices[idx++] = i0
      indices[idx++] = i0 + 1
      indices[idx++] = i0 + 2
      indices[idx++] = i0 + 1
      indices[idx++] = i0 + 3
      indices[idx++] = i0 + 2
    }
  }

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.renderOrder = LINK_RENDER_ORDER

  const group = new THREE.Group()
  group.add(mesh)

  // ── Arrow overlay (thin LineSegments, only detail/bundle, ≤ ARROW_MAX_LINKS)
  let arrowObject: THREE.LineSegments | null = null
  let arrowGeometry: THREE.BufferGeometry | null = null
  let arrowPositions = new Float32Array(0)
  let arrowColors = new Float32Array(0)
  let arrowAlphas = new Float32Array(0)
  const arrowSlot = new Int32Array(links.length).fill(-1)
  if (!isSheet && arrowsEnabled(links.length)) {
    let next = 0
    for (let i = 0; i < links.length; i++) {
      if (isDirectionalRelation(links[i].relationType)) { arrowSlot[i] = next; next += ARROW_VERTICES }
    }
    if (next > 0) {
      arrowGeometry = new THREE.BufferGeometry()
      arrowPositions = new Float32Array(next * 3)
      arrowColors = new Float32Array(next * 3)
      arrowAlphas = new Float32Array(next)
      arrowGeometry.setAttribute('position', new THREE.BufferAttribute(arrowPositions, 3))
      arrowGeometry.setAttribute('aColor', new THREE.BufferAttribute(arrowColors, 3))
      arrowGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(arrowAlphas, 1))
      arrowObject = new THREE.LineSegments(
        arrowGeometry,
        new THREE.ShaderMaterial({
          vertexShader: VERTEX_SHADER,
          fragmentShader: FRAGMENT_SHADER,
          transparent: true,
          depthWrite: false,
        }),
      )
      arrowObject.frustumCulled = false
      arrowObject.renderOrder = LINK_RENDER_ORDER
      group.add(arrowObject)
    }
  }

  // ── Adjacency (hover spotlight) ───────────────────────────────────────
  const linkIndexByNode = new Map<string, number[]>()
  const sheetByCommunity = new Map<string, number[]>()
  if (isSheet) {
    for (let r = 0; r < ribbonCount; r++) {
      for (const tok of [communityToken(meta[r].srcComm), communityToken(meta[r].tgtComm)]) {
        let arr = sheetByCommunity.get(tok)
        if (!arr) { arr = []; sheetByCommunity.set(tok, arr) }
        arr.push(r)
      }
    }
  } else {
    for (let i = 0; i < links.length; i++) {
      for (const id of [endpointId(links[i].source), endpointId(links[i].target)]) {
        if (!id) continue
        let arr = linkIndexByNode.get(id)
        if (!arr) { arr = []; linkIndexByNode.set(id, arr) }
        arr.push(i)
      }
    }
  }

  // ── Ribbon strip writer (flat band in the curve's bow plane) ──────────
  const writeStrip = (r: number, s: Vec3, t: Vec3, sourceId: string, targetId: string) => {
    const m = meta[r]
    const sampled = sampleLinkPath(s, t, linkVolume(m.repLink), sourceId, targetId, RIBBON_SUBDIVISIONS, true, m.amplitude)
    // The ribbon is centred on the curve, offset along the chord's perpendicular
    // (the same in-plane normal the bow uses) — a flat band, no twist.
    const n = perpendicular([t[0] - s[0], t[1] - s[1], t[2] - s[2]])
    const half = m.width / 2
    const base = r * RIBBON_SUBDIVISIONS * 2 * 3
    for (let k = 0; k < RIBBON_SUBDIVISIONS; k++) {
      const p = sampled[k]
      const o = base + k * 6
      positions[o] = p[0] + n[0] * half
      positions[o + 1] = p[1] + n[1] * half
      positions[o + 2] = p[2] + n[2] * half
      positions[o + 3] = p[0] - n[0] * half
      positions[o + 4] = p[1] - n[1] * half
      positions[o + 5] = p[2] - n[2] * half
    }
  }

  const writeArrow = (i: number, s: Vec3, t: Vec3) => {
    if (!arrowObject) return
    const slot = arrowSlot[i]
    if (slot < 0) return
    const m = meta[i]
    const sourceId = m.srcId
    const targetId = m.tgtId
    const straightLen = Math.hypot(t[0] - s[0], t[1] - s[1], t[2] - s[2])
    const { point, tangent } = pathPointAndTangent(
      s, t, linkVolume(m.repLink), sourceId, targetId, ARROW_ANCHOR, true, m.amplitude,
    )
    const h = computeArrowHeadAt(point, tangent, straightLen, m.repLink.relationType, links.length)
    if (h) arrowPositions.set(h, slot * 3)
    else arrowPositions.fill(s[0], slot * 3, slot * 3 + ARROW_VERTICES * 3)
  }

  const updatePositions = () => {
    if (isSheet) {
      // Centroid of each community, recomputed every frame (nodes move).
      const acc = new Map<string, { x: number; y: number; z: number; n: number }>()
      for (const node of nodes) {
        const tok = communityToken(node.communityId)
        let c = acc.get(tok)
        if (!c) { c = { x: 0, y: 0, z: 0, n: 0 }; acc.set(tok, c) }
        c.x += node.x; c.y += node.y; c.z += node.z; c.n++
      }
      const centroid = (comm: number | undefined): Vec3 => {
        const c = acc.get(communityToken(comm))
        if (!c || c.n === 0) return [0, 0, 0]
        return [c.x / c.n, c.y / c.n, c.z / c.n]
      }
      for (let r = 0; r < ribbonCount; r++) {
        const m = meta[r]
        writeStrip(r, centroid(m.srcComm), centroid(m.tgtComm), communityToken(m.srcComm), communityToken(m.tgtComm))
      }
    } else {
      for (let r = 0; r < ribbonCount; r++) {
        const m = meta[r]
        const sNode = nodeById.get(m.srcId)
        const tNode = nodeById.get(m.tgtId)
        const s: Vec3 = [sNode?.x ?? 0, sNode?.y ?? 0, sNode?.z ?? 0]
        const t: Vec3 = [tNode?.x ?? 0, tNode?.y ?? 0, tNode?.z ?? 0]
        writeStrip(r, s, t, m.srcId, m.tgtId)
        writeArrow(r, s, t)
      }
    }
    ;(geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    if (arrowGeometry) (arrowGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
  }

  // ── Colour / alpha writer ─────────────────────────────────────────────
  const paintRibbon = (r: number, s: LinkStyle, alphaOverride?: number) => {
    const base = r * RIBBON_SUBDIVISIONS * 2
    const r1 = s.r, g1 = s.g, b1 = s.b
    const r2 = s.r2 ?? s.r, g2 = s.g2 ?? s.g, b2 = s.b2 ?? s.b
    const a = (alphaOverride ?? s.a) * params.alphaScale
    for (let k = 0; k < RIBBON_SUBDIVISIONS; k++) {
      const t = k / (RIBBON_SUBDIVISIONS - 1)
      const u = 1 - t
      const cr = r1 * u + r2 * t, cg = g1 * u + g2 * t, cb = b1 * u + b2 * t
      const c = (base + k * 2) * 3
      colors[c] = cr; colors[c + 1] = cg; colors[c + 2] = cb
      colors[c + 3] = cr; colors[c + 4] = cg; colors[c + 5] = cb
      alphas[base + k * 2] = a
      alphas[base + k * 2 + 1] = a
    }
  }

  const paintArrow = (i: number, s: LinkStyle) => {
    if (!arrowObject) return
    const slot = arrowSlot[i]
    if (slot < 0) return
    const c = interpolateRgb(
      { r: s.r, g: s.g, b: s.b },
      { r: s.r2 ?? s.r, g: s.g2 ?? s.g, b: s.b2 ?? s.b },
      ARROW_ANCHOR,
    )
    const a = s.a * params.alphaScale
    for (let v = 0; v < ARROW_VERTICES; v++) {
      const o = (slot + v) * 3
      arrowColors[o] = c.r; arrowColors[o + 1] = c.g; arrowColors[o + 2] = c.b
      arrowAlphas[slot + v] = a
    }
  }

  const updateColors = (styleFn: LinkStyleFn) => {
    for (let r = 0; r < ribbonCount; r++) {
      const m = meta[r]
      const style = styleFn(m.repLink)
      // A sheet's resting alpha follows its summarized count, not the
      // single-link density term (which would floor it to invisibility).
      paintRibbon(r, style, m.isSheet ? sheetAlpha(m.count) : undefined)
      paintArrow(r, style)
    }
    markFullUpload(geometry.getAttribute('aColor') as THREE.BufferAttribute)
    markFullUpload(geometry.getAttribute('aAlpha') as THREE.BufferAttribute)
    if (arrowGeometry) {
      markFullUpload(arrowGeometry.getAttribute('aColor') as THREE.BufferAttribute)
      markFullUpload(arrowGeometry.getAttribute('aAlpha') as THREE.BufferAttribute)
    }
  }

  const updateColorsAt = (ribbonIndices: number[], styleFn: LinkStyleFn) => {
    if (ribbonIndices.length === 0) return
    const colAttr = geometry.getAttribute('aColor') as THREE.BufferAttribute
    const alpAttr = geometry.getAttribute('aAlpha') as THREE.BufferAttribute
    for (const r of ribbonIndices) {
      if (r < 0 || r >= ribbonCount) continue
      const m = meta[r]
      const style = styleFn(m.repLink)
      // Hover/spotlight: the style's own alpha, never the sheet's resting one.
      paintRibbon(r, style, undefined)
      const base = r * RIBBON_SUBDIVISIONS * 2
      markRangeUpload(colAttr, base * 3, RIBBON_SUBDIVISIONS * 2 * 3)
      markRangeUpload(alpAttr, base, RIBBON_SUBDIVISIONS * 2)
      if (arrowObject && arrowSlot[r] >= 0) {
        paintArrow(r, style)
        const aCol = arrowGeometry!.getAttribute('aColor') as THREE.BufferAttribute
        const aAlp = arrowGeometry!.getAttribute('aAlpha') as THREE.BufferAttribute
        markRangeUpload(aCol, arrowSlot[r] * 3, ARROW_VERTICES * 3)
        markRangeUpload(aAlp, arrowSlot[r], ARROW_VERTICES)
      }
    }
  }

  const updateColorsForNodes = (nodeIds: readonly string[], styleFn: LinkStyleFn) => {
    const idxSet = new Set<number>()
    if (isSheet) {
      for (const id of nodeIds) {
        const node = nodeById.get(id)
        if (!node) continue
        const arr = sheetByCommunity.get(communityToken(node.communityId))
        if (arr) for (const r of arr) idxSet.add(r)
      }
    } else {
      for (const id of nodeIds) {
        const arr = linkIndexByNode.get(id)
        if (arr) for (const i of arr) idxSet.add(i)
      }
    }
    if (idxSet.size === 0) return
    updateColorsAt([...idxSet], styleFn)
  }

  const dispose = () => {
    geometry.dispose()
    material.dispose()
    if (arrowGeometry) arrowGeometry.dispose()
    if (arrowObject) (arrowObject.material as THREE.Material).dispose()
  }

  // Initial fill.
  updatePositions()

  return { object: group, updatePositions, updateColors, updateColorsForNodes, dispose }
}
