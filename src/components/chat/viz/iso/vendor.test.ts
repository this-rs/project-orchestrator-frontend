/**
 * The 3D engine in src/vendor/three-iso is a GENERATED copy of the site's
 * src/three/iso (scripts/sync-iso-lib.mjs). This test refuses a copy edited by hand:
 * change the site, then re-sync. (CI also runs `sync-iso-lib.mjs --check`, and
 * `--drift` against the site when it is reachable.)
 */
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const dir = resolve(__dirname, '../../../../vendor/three-iso')
const sums = new Map(
  readFileSync(resolve(dir, 'SHA256SUMS'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => {
      const [sum, name] = l.trim().split(/\s+/)
      return [name!, sum!] as const
    }),
)
const source = JSON.parse(readFileSync(resolve(dir, 'SOURCE.json'), 'utf8')) as { commit: string; sources: Record<string, string> }

describe('three-iso: generated copy of the site engine', () => {
  it('every file matches its recorded checksum', () => {
    for (const [name, sum] of sums) {
      expect(createHash('sha256').update(readFileSync(resolve(dir, name))).digest('hex'), name).toBe(sum)
    }
  })

  it('holds nothing but the generated files', () => {
    const files = readdirSync(dir).filter((n) => n !== 'SHA256SUMS' && n !== 'SOURCE.json')
    expect(files.sort()).toEqual([...sums.keys()].sort())
    expect(Object.keys(source.sources).sort()).toEqual([...sums.keys()].sort())
  })

  it('every file names the site commit it came from', () => {
    for (const name of sums.keys()) {
      const first = readFileSync(resolve(dir, name), 'utf8').split('\n', 1)[0]
      expect(first).toBe(`// GENERATED from website@${source.commit}:src/three/iso/${name} by scripts/sync-iso-lib.mjs — do not edit.`)
    }
  })
})
