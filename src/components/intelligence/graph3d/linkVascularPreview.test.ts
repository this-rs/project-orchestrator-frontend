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

function synth(n: number, groups: number) {
  let seed = 11
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const nodes = Array.from({ length: n }, (_, i) => {
    const g = i % groups
    const a = (g / groups) * Math.PI * 2
    const r = 240
    const cx = Math.cos(a) * r, cy = Math.sin(a) * r * 0.55, cz = Math.cos(a * 1.7) * 90
    return {
      id: `n${i}`, label: '', entityType: i % 3 === 0 ? 'note' : 'file', layer: 'code',
      x: cx + (rnd() - 0.5) * 90, y: cy + (rnd() - 0.5) * 90, z: cz + (rnd() - 0.5) * 90,
      communityId: g, data: {},
    }
  }) as never[]
  const links = Array.from({ length: n * 2 }, () => {
    const a = Math.floor(rnd() * n)
    const b = Math.floor(rnd() * n)
    return {
      source: `n${a}`, target: `n${b}`, relationType: ['IMPORTS', 'CALLS', 'CO_CHANGED'][Math.floor(rnd() * 3)],
      layer: 'code', sourceCommunityId: a % groups, targetCommunityId: b % groups,
      color: '#fff', width: 1, particles: 0, particleSpeed: 0, isInterCommunity: false,
    }
  }) as never[]
  return { nodes, links }
}

describe('aperçu vasculaire', () => {
  it("rastérise la géométrie réelle", async () => {
    const { nodes, links } = synth(1200, 6)
    const r = createVascularLinks(nodes, links)
    expect(r).not.toBeNull()
    const g = (r!.object as unknown as { children: { geometry: {
      attributes: Record<string, { array: Float32Array; count: number }>; index: { array: Uint32Array | Uint16Array } } }[] }).children[0].geometry
    const pos = g.attributes.position.array
    const col = g.attributes.aColor.array
    const alp = g.attributes.aAlpha.array
    const nrm = g.attributes.aNormal.array
    const emi = g.attributes.aEmit.array
    const cur = g.attributes.aU.array
    const pha = g.attributes.aPhase.array
    const idx = g.index.array

    const W = 900, H = 620
    const buf = Buffer.alloc(W * H * 3)
    for (let i = 0; i < W * H; i++) { buf[i * 3] = 4; buf[i * 3 + 1] = 4; buf[i * 3 + 2] = 10 }

    // Caméra simple : perspective depuis +Z, recentrée sur l'étendue réelle.
    let cx = 0, cy = 0, cz = 0
    const nv = pos.length / 3
    for (let i = 0; i < nv; i++) { cx += pos[i * 3]; cy += pos[i * 3 + 1]; cz += pos[i * 3 + 2] }
    cx /= nv; cy /= nv; cz /= nv
    let maxR = 1
    for (let i = 0; i < nv; i++) {
      const d = Math.hypot(pos[i * 3] - cx, pos[i * 3 + 1] - cy, pos[i * 3 + 2] - cz)
      if (d > maxR) maxR = d
    }
    const dist = maxR * 2.6
    const tilt = 0.42
    const project = (x: number, y: number, z: number) => {
      const dx = x - cx, dy = y - cy, dz = z - cz
      const ry = dy * Math.cos(tilt) - dz * Math.sin(tilt)
      const rz = dy * Math.sin(tilt) + dz * Math.cos(tilt)
      const depth = rz + dist
      const f = (H * 0.9) / Math.max(1e-6, depth)
      return { sx: W / 2 + dx * f, sy: H / 2 - ry * f, depth }
    }

    for (let t = 0; t < idx.length; t += 3) {
      const i0 = idx[t], i1 = idx[t + 1], i2 = idx[t + 2]
      const p0 = project(pos[i0 * 3], pos[i0 * 3 + 1], pos[i0 * 3 + 2])
      const p1 = project(pos[i1 * 3], pos[i1 * 3 + 1], pos[i1 * 3 + 2])
      const p2 = project(pos[i2 * 3], pos[i2 * 3 + 1], pos[i2 * 3 + 2])
      // Approximation FIDÈLE du fragment shader : diffusion + bord + émission
      // bornée, puis composition alpha (le matériau n'est plus additif).
      const nx = (nrm[i0 * 3] + nrm[i1 * 3] + nrm[i2 * 3]) / 3
      const ny = (nrm[i0 * 3 + 1] + nrm[i1 * 3 + 1] + nrm[i2 * 3 + 1]) / 3
      const nz = (nrm[i0 * 3 + 2] + nrm[i1 * 3 + 2] + nrm[i2 * 3 + 2]) / 3
      const nlen = Math.hypot(nx, ny, nz) || 1
      const L = [0.45, 0.8, 0.6]
      const diff = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / nlen)
      const em = (emi[i0] + emi[i1] + emi[i2]) / 3
      // Impulsion du flux, comme le shader (à t = 0 : image stable).
      const uu = (cur[i0] + cur[i1] + cur[i2]) / 3
      const pp = pha[i0]
      const wave = ((uu * 6 - 0 + pp) % 1 + 1) % 1
      const pulse = 0.55 + 0.75 * Math.min(1, Math.max(0, wave / 0.35)) * Math.min(1, Math.max(0, (1 - wave) / 0.35))
      const minX = Math.max(0, Math.floor(Math.min(p0.sx, p1.sx, p2.sx)))
      const maxX = Math.min(W - 1, Math.ceil(Math.max(p0.sx, p1.sx, p2.sx)))
      const minY = Math.max(0, Math.floor(Math.min(p0.sy, p1.sy, p2.sy)))
      const maxY = Math.min(H - 1, Math.ceil(Math.max(p0.sy, p1.sy, p2.sy)))
      const area = (p1.sx - p0.sx) * (p2.sy - p0.sy) - (p2.sx - p0.sx) * (p1.sy - p0.sy)
      if (Math.abs(area) < 1e-9) continue
      const a0 = alp[i0] ?? 0, c0 = [col[i0 * 3], col[i0 * 3 + 1], col[i0 * 3 + 2]]
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const w0 = ((p1.sx - x) * (p2.sy - y) - (p2.sx - x) * (p1.sy - y)) / area
          const w1 = ((p2.sx - x) * (p0.sy - y) - (p0.sx - x) * (p2.sy - y)) / area
          const w2 = 1 - w0 - w1
          if (w0 < 0 || w1 < 0 || w2 < 0) continue
          // Composition ALPHA (le matériau n'est plus additif) + éclairage.
          const o = y * W + x
          const surf = 0.22 + 0.78 * diff
          const e = (1 - Math.exp(-2.0 * em * a0)) * (em > 0.5 ? pulse : 1)
          const cr = c0[0] * (surf * (1 - em) + e)
          const cg = c0[1] * (surf * (1 - em) + e)
          const cb = c0[2] * (surf * (1 - em) + e)
          const a = Math.min(1, a0 * (1 - em) * 0.85 + e)
          buf[o * 3] = Math.min(255, buf[o * 3] * (1 - a) + cr * a * 255)
          buf[o * 3 + 1] = Math.min(255, buf[o * 3 + 1] * (1 - a) + cg * a * 255)
          buf[o * 3 + 2] = Math.min(255, buf[o * 3 + 2] * (1 - a) + cb * a * 255)
        }
      }
    }
    // Noeuds, pour juger la COHERENCE d'echelle liens / noeuds.
    // Le client : les echelles ne semblent pas coherentes entre les liens et les
    // nodes. Sans les noeuds, l'apercu ne pouvait pas le montrer.
    for (const node of nodes as unknown as { x: number; y: number; z: number }[]) {
      const p = project(node.x, node.y, node.z)
      const r = 1.6
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue
          const x = Math.round(p.sx + dx)
          const y = Math.round(p.sy + dy)
          if (x < 0 || x >= W || y < 0 || y >= H) continue
          const o = y * W + x
          buf[o * 3] = Math.min(255, buf[o * 3] + 150)
          buf[o * 3 + 1] = Math.min(255, buf[o * 3 + 1] + 170)
          buf[o * 3 + 2] = Math.min(255, buf[o * 3 + 2] + 180)
        }
      }
    }
    writePng('qa-out/veines.png', W, H, buf)
    // Garde : moins de 5 000 sommets signale une chute du nombre de voies.
    expect(nv).toBeGreaterThan(5000)
  })
})
