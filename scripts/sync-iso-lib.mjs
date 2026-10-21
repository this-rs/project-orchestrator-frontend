#!/usr/bin/env node
/**
 * Vendor the site's isometric 3D engine (`website/src/three/iso/`) into the app.
 *
 * ONE source of truth: the site. The app keeps a GENERATED copy of the engine's pure
 * modules in `src/vendor/three-iso/` — never edited by hand. Each copied file is the
 * site's file at a COMMIT (never its working tree, so a half-done edit on the site is
 * never vendored), behind a two-line header:
 *
 *   // GENERATED from website@<commit>:src/three/iso/<file> by scripts/sync-iso-lib.mjs — do not edit.
 *   // @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.
 *
 * `SOURCE.json` records the site commit and the sha256 of every SITE file; `SHA256SUMS`
 * the sha256 of every GENERATED file.
 *
 * The site's page-level components (`index.ts`, `IsoHero`, `IsoIllustration`,
 * `IsoStatic`, `heroArt`, `machines/`) depend on site-only modules (`@/hooks/useSsr`,
 * `@/three/lowPower`, the site's i18n) and are NOT copied: the app's wrapper lives in
 * `src/components/chat/viz/iso/`.
 *
 * Usage:
 *   node scripts/sync-iso-lib.mjs <website root> [<ref>]   # copy the site at <ref> (default HEAD)
 *   node scripts/sync-iso-lib.mjs --check                  # exit 1 if the copy was edited by hand (CI, blocking)
 *   node scripts/sync-iso-lib.mjs --drift [<website root>] [<ref>]
 *                                                          # exit 1 if the site at <ref> moved on since the copy
 *                                                          # (root defaults to $PO_WEBSITE_DIR; CI, informative)
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dir = resolve(root, 'src/vendor/three-iso')
const SITE_PATH = 'src/three/iso'
const SUMS = 'SHA256SUMS'
const SOURCE = 'SOURCE.json'

/** The engine's pure modules, plus `IsoGL.tsx` (a WebGL canvas that imports only React and the engine). */
const FILES = [
  'ast.ts',
  'buildIn.ts',
  'catalog.ts',
  'choreography.ts',
  'compose.ts',
  'drive.ts',
  'fit.ts',
  'focus.ts',
  'iso.ts',
  'IsoGL.tsx',
  'layouts.ts',
  'litRenderer.ts',
  'live.ts',
  'machine.ts',
  'meaning.ts',
  'mechanisms.ts',
  'scene.ts',
  'shading.ts',
  'stations.ts',
  'triangulate.ts',
]

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const header = (commit, name) =>
  `// GENERATED from website@${commit}:${SITE_PATH}/${name} by scripts/sync-iso-lib.mjs — do not edit.\n` +
  '// @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.\n'

function recordedSums() {
  const out = new Map()
  for (const line of readFileSync(resolve(dir, SUMS), 'utf8').trim().split('\n')) {
    const [sum, name] = line.trim().split(/\s+/)
    out.set(name.replace(/^\*/, ''), sum)
  }
  return out
}

function check() {
  const sums = recordedSums()
  const problems = []
  for (const name of FILES) if (!sums.has(name)) problems.push(`${name}: not recorded in ${SUMS} (run the sync)`)
  for (const [name, sum] of sums) {
    const p = resolve(dir, name)
    const actual = existsSync(p) ? sha256(readFileSync(p)) : '(missing)'
    if (actual !== sum) problems.push(`${name}: recorded ${sum}, actual ${actual} — the copy is generated: change the site, then re-sync`)
  }
  for (const n of readdirSync(dir)) {
    if (n !== SUMS && n !== SOURCE && !sums.has(n)) problems.push(`${n}: not part of the generated copy (the app's own code goes in src/components/chat/viz/iso/)`)
  }
  return problems
}

function siteRoot(arg) {
  const r = arg ?? process.env.PO_WEBSITE_DIR
  if (!r) return null
  const abs = resolve(process.cwd(), r)
  return existsSync(resolve(abs, SITE_PATH)) ? abs : null
}

const git = (site, ...a) => execFileSync('git', ['-C', site, ...a], { maxBuffer: 16 * 1024 * 1024 })
/** The site's file at `ref` (a commit: never the working tree). */
const siteFile = (site, ref, name) => {
  try {
    return git(site, 'show', `${ref}:${SITE_PATH}/${name}`)
  } catch {
    return null
  }
}

const arg = process.argv[2]
if (!arg) {
  console.error('usage: sync-iso-lib.mjs <website root> [<ref>] | --check | --drift [<website root>] [<ref>]')
  process.exit(2)
}

if (arg === '--check') {
  const problems = check()
  if (problems.length) {
    for (const p of problems) console.error(`three-iso copy: ${p}`)
    process.exit(1)
  }
  const src = JSON.parse(readFileSync(resolve(dir, SOURCE), 'utf8'))
  console.log(`three-iso copy OK (${FILES.length} files, website@${src.commit.slice(0, 7)})`)
  process.exit(0)
}

if (arg === '--drift') {
  const site = siteRoot(process.argv[3])
  if (!site) {
    console.log('three-iso drift: website repo not available (pass its root or set PO_WEBSITE_DIR) — skipped.')
    process.exit(0)
  }
  const ref = process.argv[4] ?? 'HEAD'
  const src = JSON.parse(readFileSync(resolve(dir, SOURCE), 'utf8'))
  const moved = FILES.filter((n) => {
    const buf = siteFile(site, ref, n)
    return !buf || sha256(buf) !== src.sources[n]
  })
  if (moved.length) {
    console.error(`three-iso drift: website@${ref} changed ${moved.length} file(s) since the copy (website@${src.commit.slice(0, 7)}): ${moved.join(', ')}`)
    console.error(`re-sync: node scripts/sync-iso-lib.mjs ${site} ${ref}`)
    process.exit(1)
  }
  console.log(`three-iso drift: the copy matches website@${ref}.`)
  process.exit(0)
}

const site = siteRoot(arg)
if (!site) {
  console.error(`not a website root (no ${SITE_PATH}/): ${arg}`)
  process.exit(2)
}
const ref = process.argv[3] ?? 'HEAD'
let commit
let branch
try {
  commit = git(site, 'rev-parse', `${ref}^{commit}`).toString().trim()
  branch = git(site, 'rev-parse', '--abbrev-ref', 'HEAD').toString().trim()
} catch {
  console.error(`the website root must be a git checkout with ${ref}: the copy is pinned to a commit`)
  process.exit(2)
}
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })
const sums = []
const sources = {}
for (const name of FILES) {
  const buf = siteFile(site, commit, name)
  if (!buf) {
    console.error(`missing in website@${commit.slice(0, 7)}: ${SITE_PATH}/${name}`)
    process.exit(1)
  }
  sources[name] = sha256(buf)
  const out = Buffer.concat([Buffer.from(header(commit, name)), buf])
  writeFileSync(resolve(dir, name), out)
  sums.push(`${sha256(out)}  ${name}`)
}
writeFileSync(resolve(dir, SUMS), sums.join('\n') + '\n')
writeFileSync(resolve(dir, SOURCE), JSON.stringify({ repo: 'website', path: SITE_PATH, commit, branch, sources }, null, 2) + '\n')
console.log(`copied ${FILES.length} files from website@${commit.slice(0, 7)} (${branch}):${SITE_PATH}`)
