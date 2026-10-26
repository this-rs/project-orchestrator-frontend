// Hand-written companion to the GENERATED three-iso files (scene.ts / ast.ts): validates the ```scene3d
// (v2) contract from frontend/docs/architecture/3d-general/01-scene-contract.md. It does NOT touch the v1
// engine (`checkSpec` / `checkAst`); a v1 payload is left to those, unchanged. Exports `checkSceneV2`,
// returning the list of problems (empty = valid), mirroring the backend `scene3d_problems`.

export const SCENE_V2_LIMITS = {
  maxTitle: 120,
  maxCaption: 300,
  maxNodes: 512,
  maxDepth: 32,
  maxAssets: 256,
  maxMaterials: 64,
  maxTextures: 32,
  maxLights: 16,
  maxMeshes: 256,
  maxVertices: 65_536,
  maxTriangles: 131_072,
  maxVerticesTotal: 1_048_576,
  maxTrianglesTotal: 2_097_152,
  posLo: -1000,
  posHi: 1000,
  rotLo: -360,
  rotHi: 360,
  uvLo: -64,
  uvHi: 64,
  scaleLo: 1e-4,
  scaleHi: 1000,
  maxUrl: 2048,
  maxDataBytes: 512 * 1024,
  fovLo: 1,
  fovHi: 120,
  nearHi: 10_000,
  farHi: 100_000,
  intensityHi: 100,
  distanceHi: 10_000,
  decayHi: 4,
  emissiveHi: 64,
  iorLo: 1,
  iorHi: 3,
  maxId: 64,
} as const

type Obj = Record<string, unknown>

const V1_KEYS = ['layout', 'stations', 'angles', 'home', 'stepSeconds', 'focal', 'build', 'ast', 'tone', 'label']
const V2_KEYS = ['camera', 'lights', 'textures', 'materials', 'assets', 'nodes']
const META_KEYS = ['version', 'title', 'caption']
const VERSIONS = ['1', '2']
const CAMERA_KINDS = ['perspective', 'orthographic']
const TEXTURE_KINDS = ['image', 'procedural']
const PROCEDURAL_TYPES = ['checker', 'solid', 'gradient']
const WRAPS = ['repeat', 'clamp', 'mirror']
const FILTERS = ['nearest', 'linear']
const LIGHT_KINDS = ['ambient', 'directional', 'point']
const WINDINGS = ['ccw', 'cw']
// v1 catalog (mirrors `ast.ts` KINDS and `catalog.ts` OBJECTS, kept here so the companion is self-contained).
const V1_KINDS = ['slab', 'puck', 'sphere', 'tube', 'ring', 'cone', 'lathe', 'capsule', 'repeat', 'torus', 'group', 'use']
const V1_OBJECTS = ['agent', 'screen', 'chip', 'flag', 'arrow', 'server', 'document', 'node', 'step']

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}
function isId(s: string): boolean {
  return s.length > 0 && s.length <= SCENE_V2_LIMITS.maxId && /^[a-z0-9]+([-.][a-z0-9]+)*$/.test(s)
}
function numIn(v: unknown, lo: number, hi: number): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi
}
function intIn(v: unknown, lo: number, hi: number): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi
}
function vec3(v: unknown, lo: number, hi: number): boolean {
  return Array.isArray(v) && v.length === 3 && v.every((x) => numIn(x, lo, hi))
}
function isHexColor(s: string): boolean {
  const hex = s.startsWith('#') ? s.slice(1) : s
  return (hex.length === 3 || hex.length === 4 || hex.length === 6 || hex.length === 8) && /^[0-9a-f]+$/i.test(hex)
}
function isColor(v: unknown): boolean {
  if (typeof v === 'string') return isHexColor(v)
  return Array.isArray(v) && (v.length === 3 || v.length === 4) && v.every((x) => numIn(x, 0, 1))
}

/** Validates a `scene3d` (v2) payload. Empty array = accepted. A v1 payload (no v2 fields) returns `[]`. */
export function checkSceneV2(scene: unknown): string[] {
  const out: string[] = []
  if (!isObj(scene)) return ['not an object']

  const version = typeof scene.version === 'string' ? scene.version : undefined
  if (version !== undefined && !VERSIONS.includes(version)) {
    out.push(`unknown version ${version}`)
    return out
  }
  const has = (keys: readonly string[]) => keys.some((k) => k in scene)
  const hasV1 = has(V1_KEYS)
  const hasV2 = has(V2_KEYS)
  if (hasV1 && hasV2) {
    out.push('mixed v1 and v2 fields')
    return out
  }
  const isV1 =
    version === '1' ? true : version === '2' ? false : hasV1 ? true : hasV2 ? false : undefined
  if (isV1 === undefined) return ['a scene needs stations/ast or nodes']
  if (isV1) {
    if (hasV2) out.push('version 1 with v2 fields')
    // v1 payload: validated by checkSpec/checkAst (unchanged); nothing v2-specific to check here.
    return out
  }
  if (hasV1) {
    out.push('version 2 with v1 fields')
    return out
  }

  // v2 root
  if (typeof scene.title === 'string' && scene.title.length > SCENE_V2_LIMITS.maxTitle) out.push('bad title')
  if (typeof scene.caption === 'string' && scene.caption.length > SCENE_V2_LIMITS.maxCaption) out.push('bad caption')
  for (const k of Object.keys(scene)) {
    if (!V2_KEYS.includes(k) && !META_KEYS.includes(k)) out.push(`unknown scene field ${k}`)
  }

  // textures
  const textureIds = new Set<string>()
  const textures = asArray(scene.textures)
  if (textures.length > SCENE_V2_LIMITS.maxTextures) out.push(`${textures.length} textures (at most ${SCENE_V2_LIMITS.maxTextures})`)
  textures.forEach((t, i) => {
    if (!isObj(t)) {
      out.push(`texture ${i} not an object`)
      return
    }
    const id = typeof t.id === 'string' ? t.id : ''
    if (!id) {
      out.push(`texture ${i} needs an id`)
      return
    }
    if (!isId(id)) out.push(`texture ${i}: bad id ${id}`)
    if (textureIds.has(id)) out.push(`duplicate texture id ${id}`)
    textureIds.add(id)
    const kind = typeof t.kind === 'string' ? t.kind : ''
    if (!TEXTURE_KINDS.includes(kind)) {
      out.push(`texture ${id}: unknown kind ${kind}`)
      return
    }
    if (kind === 'image') {
      if (!isObj(t.image)) {
        out.push(`texture ${id}: image must be an object`)
        return
      }
      if (typeof t.image.url === 'string') {
        const u = t.image.url
        if (u.length > SCENE_V2_LIMITS.maxUrl) out.push(`texture ${id}: url too long`)
        if (!(u.startsWith('https:') || u.startsWith('data:image/'))) out.push(`texture ${id}: url scheme must be https: or data:image/`)
        if (u.startsWith('data:') && Math.floor((u.length * 3) / 4) > SCENE_V2_LIMITS.maxDataBytes) out.push(`texture ${id}: data URI too large`)
      }
      const wrapChecks: ReadonlyArray<readonly [string, readonly string[]]> = [
        ['wrapS', WRAPS],
        ['wrapT', WRAPS],
        ['minFilter', FILTERS],
        ['magFilter', FILTERS],
      ]
      for (const [key, allowed] of wrapChecks) {
        const v = t.image[key]
        if (typeof v === 'string' && !allowed.includes(v)) out.push(`texture ${id}: ${key} ${v} not in ${allowed.join(',')}`)
      }
    } else if (kind === 'procedural') {
      if (!isObj(t.procedural)) {
        out.push(`texture ${id}: procedural must be an object`)
        return
      }
      const ty = typeof t.procedural.type === 'string' ? t.procedural.type : ''
      if (!PROCEDURAL_TYPES.includes(ty)) out.push(`texture ${id}: unknown procedural type ${ty}`)
      for (const key of ['colorA', 'colorB']) {
        const v = t.procedural[key]
        if (v !== undefined && !(typeof v === 'string' && isHexColor(v))) out.push(`texture ${id}: ${key} must be a hex color`)
      }
      if (t.procedural.scale !== undefined && !intIn(t.procedural.scale, 1, 64)) out.push(`texture ${id}: scale must be an integer 1..64`)
    }
  })

  // materials
  const materialIds = new Set<string>()
  const materials = asArray(scene.materials)
  if (materials.length > SCENE_V2_LIMITS.maxMaterials) out.push(`${materials.length} materials (at most ${SCENE_V2_LIMITS.maxMaterials})`)
  materials.forEach((m, i) => {
    if (!isObj(m)) {
      out.push(`material ${i} not an object`)
      return
    }
    const id = typeof m.id === 'string' ? m.id : ''
    if (!id) {
      out.push(`material ${i} needs an id`)
      return
    }
    if (!isId(id)) out.push(`material ${i}: bad id ${id}`)
    if (materialIds.has(id)) out.push(`duplicate material id ${id}`)
    materialIds.add(id)
    for (const key of ['baseColor', 'emissive']) {
      if (m[key] !== undefined && !isColor(m[key])) out.push(`material ${id}: bad ${key}`)
    }
    for (const [key, lo, hi] of [
      ['metallic', 0, 1],
      ['roughness', 0, 1],
      ['opacity', 0, 1],
      ['alphaCutoff', 0, 1],
    ] as const) {
      if (m[key] !== undefined && !numIn(m[key], lo, hi)) out.push(`material ${id}: ${key} must be ${lo}..${hi}`)
    }
    if (m.emissiveIntensity !== undefined && !numIn(m.emissiveIntensity, 0, SCENE_V2_LIMITS.emissiveHi)) out.push(`material ${id}: emissiveIntensity out of range`)
    if (m.ior !== undefined && !numIn(m.ior, SCENE_V2_LIMITS.iorLo, SCENE_V2_LIMITS.iorHi)) out.push(`material ${id}: ior out of range`)
    for (const key of ['baseColorTexture', 'normalMap', 'metallicRoughnessTexture', 'occlusionTexture']) {
      const v = m[key]
      if (v !== undefined && v !== null && !(typeof v === 'string' && textureIds.has(v))) out.push(`material ${id}: ${key} does not reference a texture`)
    }
    if (m.doubleSided !== undefined && typeof m.doubleSided !== 'boolean') out.push(`material ${id}: doubleSided must be a boolean`)
  })

  // camera
  if (scene.camera !== undefined) {
    if (!isObj(scene.camera)) out.push('camera must be an object')
    else {
      const cam = scene.camera
      const kind = typeof cam.kind === 'string' ? cam.kind : 'perspective'
      if (!CAMERA_KINDS.includes(kind)) out.push(`camera: unknown kind ${kind}`)
      for (const key of ['position', 'target', 'up']) {
        if (cam[key] !== undefined && !vec3(cam[key], SCENE_V2_LIMITS.posLo, SCENE_V2_LIMITS.posHi)) out.push(`camera: ${key} must be [x,y,z]`)
      }
      if (cam.near !== undefined && !(typeof cam.near === 'number' && cam.near > 0 && cam.near <= SCENE_V2_LIMITS.nearHi)) out.push(`camera: near must be in (0, ${SCENE_V2_LIMITS.nearHi}]`)
      if (cam.far !== undefined && !(typeof cam.far === 'number' && Number.isFinite(cam.far) && cam.far <= SCENE_V2_LIMITS.farHi)) out.push(`camera: far must be <= ${SCENE_V2_LIMITS.farHi}`)
      if (typeof cam.near === 'number' && typeof cam.far === 'number' && cam.far <= cam.near) out.push('camera: far must be > near')
      if (kind === 'perspective') {
        if (cam.fov !== undefined && !numIn(cam.fov, SCENE_V2_LIMITS.fovLo, SCENE_V2_LIMITS.fovHi)) out.push('camera: fov out of range')
      } else {
        if (cam.zoom !== undefined && !(typeof cam.zoom === 'number' && cam.zoom > 0 && cam.zoom <= 1000)) out.push('camera: zoom must be in (0, 1000]')
        if (typeof cam.left === 'number' && typeof cam.right === 'number' && cam.right <= cam.left) out.push('camera: right must be > left')
        if (typeof cam.bottom === 'number' && typeof cam.top === 'number' && cam.top <= cam.bottom) out.push('camera: top must be > bottom')
      }
    }
  }

  // lights
  const lights = asArray(scene.lights)
  if (lights.length > SCENE_V2_LIMITS.maxLights) out.push(`${lights.length} lights (at most ${SCENE_V2_LIMITS.maxLights})`)
  lights.forEach((l, i) => {
    if (!isObj(l)) {
      out.push(`light ${i} not an object`)
      return
    }
    const kind = typeof l.kind === 'string' ? l.kind : ''
    if (!LIGHT_KINDS.includes(kind)) {
      out.push(`light ${i}: unknown kind ${kind}`)
      return
    }
    if (l.color !== undefined && !isColor(l.color)) out.push(`light ${i}: bad color`)
    if (l.intensity !== undefined && !numIn(l.intensity, 0, SCENE_V2_LIMITS.intensityHi)) out.push(`light ${i}: intensity out of range`)
    if (kind === 'directional') {
      const d = l.direction
      const nonzero = Array.isArray(d) && d.some((x) => typeof x === 'number' && x !== 0)
      if (!vec3(d, SCENE_V2_LIMITS.posLo, SCENE_V2_LIMITS.posHi) || !nonzero) out.push(`light ${i}: direction must be a non-zero [x,y,z]`)
    } else if (kind === 'point') {
      if (l.position !== undefined && !vec3(l.position, SCENE_V2_LIMITS.posLo, SCENE_V2_LIMITS.posHi)) out.push(`light ${i}: position out of range`)
      if (l.distance !== undefined && !numIn(l.distance, 0, SCENE_V2_LIMITS.distanceHi)) out.push(`light ${i}: distance out of range`)
      if (l.decay !== undefined && !numIn(l.decay, 0, SCENE_V2_LIMITS.decayHi)) out.push(`light ${i}: decay out of range`)
    }
  })

  // assets
  const assetIds = new Set<string>()
  const assets = asArray(scene.assets)
  if (assets.length > SCENE_V2_LIMITS.maxAssets) out.push(`${assets.length} assets (at most ${SCENE_V2_LIMITS.maxAssets})`)
  assets.forEach((a, i) => {
    if (!isObj(a)) {
      out.push(`asset ${i} not an object`)
      return
    }
    const id = typeof a.id === 'string' ? a.id : ''
    if (!id) {
      out.push(`asset ${i} needs an id`)
      return
    }
    if (!isId(id)) out.push(`asset ${i}: bad id ${id}`)
    if (assetIds.has(id)) out.push(`duplicate asset id ${id}`)
    assetIds.add(id)
  })

  // nodes
  const nodeIds = new Set<string>()
  const parents = new Map<string, string | undefined>()
  let meshCount = 0
  let verticesTotal = 0
  let trianglesTotal = 0

  const checkMesh = (mesh: unknown, where: string) => {
    if (!isObj(mesh)) {
      out.push(`${where}: mesh must be an object`)
      return
    }
    const positions = asArray(mesh.positions)
    if (positions.length === 0 || positions.length % 3 !== 0) {
      out.push(`${where}: positions length must be a positive multiple of 3`)
      return
    }
    const vcount = positions.length / 3
    if (vcount > SCENE_V2_LIMITS.maxVertices) out.push(`${where}: ${vcount} vertices (at most ${SCENE_V2_LIMITS.maxVertices})`)
    if (positions.some((x) => !numIn(x, SCENE_V2_LIMITS.posLo, SCENE_V2_LIMITS.posHi))) out.push(`${where}: a position component out of range`)
    const normals = Array.isArray(mesh.normals) ? mesh.normals : undefined
    if (normals) {
      if (normals.length !== positions.length) out.push(`${where}: normals length must equal positions length`)
      else if (normals.some((x) => !numIn(x, -1, 1))) out.push(`${where}: a normal component out of range`)
    }
    const uvs = Array.isArray(mesh.uvs) ? mesh.uvs : undefined
    if (uvs) {
      if (uvs.length !== vcount * 2) out.push(`${where}: uvs length must be 2 × vertex count`)
      else if (uvs.some((x) => !numIn(x, SCENE_V2_LIMITS.uvLo, SCENE_V2_LIMITS.uvHi))) out.push(`${where}: a uv component out of range`)
    }
    const indices = asArray(mesh.indices)
    if (indices.length === 0 || indices.length % 3 !== 0) {
      out.push(`${where}: indices length must be a positive multiple of 3`)
      return
    }
    if (indices.some((i) => !(typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < vcount))) out.push(`${where}: an index is >= vertex count`)
    const tcount = indices.length / 3
    if (tcount > SCENE_V2_LIMITS.maxTriangles) out.push(`${where}: ${tcount} triangles (at most ${SCENE_V2_LIMITS.maxTriangles})`)
    if (typeof mesh.winding === 'string' && !WINDINGS.includes(mesh.winding)) out.push(`${where}: unknown winding ${mesh.winding}`)
    if (typeof mesh.material === 'string' && !materialIds.has(mesh.material)) out.push(`${where}: material ${mesh.material} not declared`)
    verticesTotal += vcount
    trianglesTotal += tcount
  }

  const nodes = asArray(scene.nodes)
  if (nodes.length > SCENE_V2_LIMITS.maxNodes) out.push(`${nodes.length} nodes (at most ${SCENE_V2_LIMITS.maxNodes})`)
  nodes.forEach((n, i) => {
    const where = `node ${i}`
    if (!isObj(n)) {
      out.push(`${where} not an object`)
      return
    }
    const id = typeof n.id === 'string' ? n.id : ''
    if (!id) {
      out.push(`${where} needs an id`)
      return
    }
    if (!isId(id)) out.push(`${where}: bad id ${id}`)
    if (nodeIds.has(id)) out.push(`${where}: duplicate id ${id}`)
    nodeIds.add(id)
    parents.set(id, typeof n.parent === 'string' ? n.parent : undefined)

    if (n.position !== undefined && !vec3(n.position, SCENE_V2_LIMITS.posLo, SCENE_V2_LIMITS.posHi)) out.push(`${where}: position out of range`)
    if (n.rotation !== undefined && !vec3(n.rotation, SCENE_V2_LIMITS.rotLo, SCENE_V2_LIMITS.rotHi)) out.push(`${where}: rotation out of range`)
    if (n.quaternion !== undefined) {
      const q = n.quaternion
      const norm =
        Array.isArray(q) && q.length === 4 ? q.reduce<number>((s, x) => s + (typeof x === 'number' ? x * x : 0), 0) : NaN
      if (!(Number.isFinite(norm) && Math.abs(norm - 1) <= 1e-4)) out.push(`${where}: quaternion must be normalized`)
    }
    if (n.rotation !== undefined && n.quaternion !== undefined) out.push(`${where}: rotation and quaternion are exclusive`)
    if (n.scale !== undefined) {
      const ok =
        typeof n.scale === 'number'
          ? numIn(n.scale, SCENE_V2_LIMITS.scaleLo, SCENE_V2_LIMITS.scaleHi)
          : Array.isArray(n.scale) && n.scale.length === 3 && n.scale.every((x) => numIn(x, SCENE_V2_LIMITS.scaleLo, SCENE_V2_LIMITS.scaleHi))
      if (!ok) out.push(`${where}: scale out of range`)
    }

    const content = [n.primitive !== undefined, n.mesh !== undefined, n.instance !== undefined].filter(Boolean).length
    if (content !== 1) out.push(`${where}: exactly one of primitive, mesh, instance`)
    if (n.mesh !== undefined) {
      meshCount++
      checkMesh(n.mesh, where)
    }
    if (isObj(n.instance)) {
      const asset = typeof n.instance.asset === 'string' ? n.instance.asset : ''
      const known = assetIds.has(asset) || V1_OBJECTS.includes(asset) || asset.startsWith('mech:')
      if (!known) out.push(`${where}: unknown asset ${asset}`)
      if (typeof n.instance.material === 'string' && !materialIds.has(n.instance.material)) out.push(`${where}: material not declared`)
    }
    if (isObj(n.primitive)) {
      const kind = typeof n.primitive.kind === 'string' ? n.primitive.kind : ''
      if (!V1_KINDS.includes(kind)) out.push(`${where}: unknown primitive kind ${kind}`)
    }
    if (typeof n.material === 'string' && !materialIds.has(n.material)) out.push(`${where}: material ${n.material} not declared`)
    for (const key of ['visible', 'castsShadow', 'receivesShadow'] as const) {
      if (n[key] !== undefined && typeof n[key] !== 'boolean') out.push(`${where}: ${key} must be a boolean`)
    }
  })

  // parents resolution + acyclicity + depth
  for (const id of nodeIds) {
    const path = new Set<string>()
    let cur = id
    let depth = 0
    for (;;) {
      if (path.has(cur)) {
        out.push(`node ${id}: parent cycle`)
        break
      }
      path.add(cur)
      const p = parents.get(cur)
      if (p === undefined) break
      if (!nodeIds.has(p)) {
        out.push(`node ${id}: parent ${p} not declared`)
        break
      }
      cur = p
      depth++
      if (depth > SCENE_V2_LIMITS.maxDepth) {
        out.push(`node ${id}: graph too deep`)
        break
      }
    }
  }

  if (meshCount > SCENE_V2_LIMITS.maxMeshes) out.push(`${meshCount} meshes (at most ${SCENE_V2_LIMITS.maxMeshes})`)
  if (verticesTotal > SCENE_V2_LIMITS.maxVerticesTotal) out.push(`${verticesTotal} vertices total`)
  if (trianglesTotal > SCENE_V2_LIMITS.maxTrianglesTotal) out.push(`${trianglesTotal} triangles total`)

  return out
}
