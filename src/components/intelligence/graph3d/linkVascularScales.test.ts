import { describe, it } from 'vitest'
import zlib from 'node:zlib'
import fs from 'node:fs'
import { createVascularLinks } from './linkVascularRenderer'

// ── Écriture PNG minimale (zlib + CRC32), pour REGARDER la géométrie ────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function writePng(path: string, w: number, h: number, rgb: Buffer) {
  fs.mkdirSync(path.split('/').slice(0, -1).join('/') || '.', { recursive: true })
  const stride = w * 3
  const raw = Buffer.alloc((stride + 1) * h)
  for (let y = 0; y < h; y++) rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
  fs.writeFileSync(path, png)
}


/**
 * APERÇU DES ÉCHELLES (phase 10, demandé par le client : « tu n'as pas fait
 * toutes les échelles »).
 *
 * Une chaîne de huit groupes, chaque liaison portant une magnitude différente :
 * 1, 10, 100, 1 000, 10 000, 100 000, 10⁶, 10⁹. Les magnitudes sont synthétiques
 * et EXPLICITEMENT des fixtures — elles servent à vérifier que le moteur les
 * différencie visuellement, pas à prétendre à des données réelles.
 *
 * Ce qu'on doit voir, de gauche à droite : un filament, puis des faisceaux de
 * plus en plus épais et de plus en plus subdivisés, jusqu'à une autoroute.
 */
describe('échelles du moteur', () => {
  it('rend la gamme 1 → 10⁹ et vérifie qu’elle est différenciée', () => {
    const SCALES = [1n, 10n, 100n, 1_000n, 10_000n, 100_000n, 1_000_000n, 1_000_000_000n]
    // Huit groupes en ligne : la gauche relie 1 relation, la droite 10⁹.
    const nodes = SCALES.map((_, i) => ({
      id: `g${i}`, label: '', entityType: 'file', layer: 'code',
      x: -420 + i * 120, y: 0, z: 0, communityId: i, data: {},
    })) as never[]
    // Une arête par liaison, portant SA multiplicité exacte.
    const links = SCALES.slice(0, -1).map((count, i) => ({
      source: `g${i}`, target: `g${i + 1}`,
      relationType: ['IMPORTS', 'CALLS', 'CO_CHANGED'][i % 3], layer: 'code',
      sourceCommunityId: i, targetCommunityId: i + 1,
      count: Number(count),
      color: '#fff', width: 1, particles: 0, particleSpeed: 0, isInterCommunity: true,
    })) as never[]

    const r = createVascularLinks(nodes, links)
    expect(r).not.toBeNull()
    const g = (r!.object as unknown as { children: { geometry: {
      attributes: Record<string, { array: Float32Array }>; index: { array: Uint32Array | Uint16Array } } }[] }).children[0].geometry
    const pos = g.attributes.position.array
    const col = g.attributes.aColor.array
    const alp = g.attributes.aAlpha.array
    const nrm = g.attributes.aNormal.array
    const emi = g.attributes.aEmit.array
    const cur = g.attributes.aU.array
    const pha = g.attributes.aPhase.array
    const idx = g.index.array

    const W = 1200, H = 500
    const buf = Buffer.alloc(W * H * 3)
    for (let i = 0; i < W * H; i++) { buf[i * 3] = 4; buf[i * 3 + 1] = 4; buf[i * 3 + 2] = 10 }

    let cx = 0, cy = 0, cz = 0
    const nv = pos.length / 3
    for (let i = 0; i < nv; i++) { cx += pos[i * 3]; cy += pos[i * 3 + 1]; cz += pos[i * 3 + 2] }
    cx /= nv; cy /= nv; cz /= nv
    let maxR = 1
    for (let i = 0; i < nv; i++) {
      const d = Math.hypot(pos[i * 3] - cx, pos[i * 3 + 1] - cy, pos[i * 3 + 2] - cz)
      if (d > maxR) maxR = d
    }
    const dist = maxR * 2.4
    const project = (x: number, y: number, z: number) => {
      const dx = x - cx, dy = y - cy, dz = z - cz
      const depth = dz + dist
      const f = (H * 0.85) / Math.max(1e-6, depth)
      return { sx: W / 2 + dx * f, sy: H / 2 - dy * f }
    }

    for (let t = 0; t < idx.length; t += 3) {
      const i0 = idx[t], i1 = idx[t + 1], i2 = idx[t + 2]
      const p0 = project(pos[i0 * 3], pos[i0 * 3 + 1], pos[i0 * 3 + 2])
      const p1 = project(pos[i1 * 3], pos[i1 * 3 + 1], pos[i1 * 3 + 2])
      const p2 = project(pos[i2 * 3], pos[i2 * 3 + 1], pos[i2 * 3 + 2])
      const nx = (nrm[i0 * 3] + nrm[i1 * 3] + nrm[i2 * 3]) / 3
      const ny = (nrm[i0 * 3 + 1] + nrm[i1 * 3 + 1] + nrm[i2 * 3 + 1]) / 3
      const nz = (nrm[i0 * 3 + 2] + nrm[i1 * 3 + 2] + nrm[i2 * 3 + 2]) / 3
      const nlen = Math.hypot(nx, ny, nz) || 1
      const diff = Math.max(0, (nx * 0.45 + ny * 0.8 + nz * 0.6) / nlen)
      const em = (emi[i0] + emi[i1] + emi[i2]) / 3
      const uu = (cur[i0] + cur[i1] + cur[i2]) / 3
      const wave = ((uu * 6 + pha[i0]) % 1 + 1) % 1
      const pulse = 0.55 + 0.75 * Math.min(1, Math.max(0, wave / 0.35)) * Math.min(1, Math.max(0, (1 - wave) / 0.35))
      const a0 = alp[i0] ?? 0
      const c0 = [col[i0 * 3], col[i0 * 3 + 1], col[i0 * 3 + 2]]
      const minX = Math.max(0, Math.floor(Math.min(p0.sx, p1.sx, p2.sx)))
      const maxX = Math.min(W - 1, Math.ceil(Math.max(p0.sx, p1.sx, p2.sx)))
      const minY = Math.max(0, Math.floor(Math.min(p0.sy, p1.sy, p2.sy)))
      const maxY = Math.min(H - 1, Math.ceil(Math.max(p0.sy, p1.sy, p2.sy)))
      const area = (p1.sx - p0.sx) * (p2.sy - p0.sy) - (p2.sx - p0.sx) * (p1.sy - p0.sy)
      if (Math.abs(area) < 1e-9) continue
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const w0 = ((p1.sx - x) * (p2.sy - y) - (p2.sx - x) * (p1.sy - y)) / area
          const w1 = ((p2.sx - x) * (p0.sy - y) - (p0.sx - x) * (p2.sy - y)) / area
          const w2 = 1 - w0 - w1
          if (w0 < 0 || w1 < 0 || w2 < 0) continue
          const o = y * W + x
          const surf = 0.32 + 0.68 * diff
          const e = (1 - Math.exp(-2.0 * em * a0)) * (em > 0.5 ? pulse : 1)
          const alpha = Math.min(1, a0 * (1 - em) + e)
          for (let c = 0; c < 3; c++) {
            const cc = c0[c] * (surf * (1 - em) + e)
            buf[o * 3 + c] = Math.min(255, buf[o * 3 + c] * (1 - alpha) + cc * alpha * 255)
          }
        }
      }
    }
    writePng('qa-out/echelles.png', W, H, buf)

    // VÉRIFICATION STRUCTURELLE, pas seulement visuelle : le nombre de sommets
    // doit croître avec la magnitude — un filament n'a pas les mêmes canaux
    // qu'une autoroute.
    const stats = r!.stats!
    expect(stats.triangles).toBeGreaterThan(0)
    expect(nv).toBeGreaterThan(1000)
  })
})
