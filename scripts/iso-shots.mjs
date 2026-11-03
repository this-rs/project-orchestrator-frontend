#!/usr/bin/env node
// Banc de revue du moteur 3D isométrique : rend la galerie de scripts/iso-gallery.mjs
// en une planche PNG par largeur, pour qu'un agent REGARDE le vrai rendu et le juge.
//
//   npm run iso:shots                        construit + 2 planches (390 / 1440) → qa-out/iso/
//   npm run iso:shots -- --only=six-ring     une seule scène
//   npm run iso:shots -- --widths=390        une seule largeur
//   npm run iso:shots -- --no-build          réutilise le bundle de galerie déjà construit
//   npm run iso:shots -- --out=<dir> --chrome=<path>
//
// Ce que ça mesure : le VRAI rendu du moteur (compileIsoScene → IsoRenderer, la classe
// qu'IsoGL instancie), pas une réimplémentation. Le point d'entrée
// scripts/iso-gallery-entry.tsx est bundlé par esbuild (alias `@` → src, `@/i18n` → un
// stub sans import.meta.glob). Chaque tuile est UNE image WebGL SYNCHRONE de la machine
// complète (déterministe et légère : en headless, une scène animée sature le CPU et
// pend le CDP). WebGL indisponible → repli SVG, et la planche le DIT (renderer: webgl|svg).
//
// Sorties : qa-out/iso/index.md (une ligne par tuile : slug, titre, ok/refusé+raisons),
// qa-out/iso/gallery.json, et une planche PNG par largeur (iso-<width>.png).
// Codes de sortie : 0 tout est conforme, 1 une scène ne rend pas comme attendu,
// 2 le banc lui-même n'a pas pu tourner.
//
// Mécanique Chrome headless par CDP (WebSocket global de Node) reprise de scripts/qa-shots.mjs :
// pas de Playwright, pas de Python, pas de dépendance ajoutée.
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'
import { SCENES } from './iso-gallery.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPTS = path.join(ROOT, 'scripts')
const SRC = path.join(ROOT, 'src')
const VIEWPORTS = { 390: { width: 390, height: 844 }, 1440: { width: 1440, height: 900 } }
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
]

// ---------- args ----------
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true] }))
const list = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])
const OUT = path.resolve(args.out || process.env.ISO_OUT || path.join(ROOT, 'qa-out', 'iso'))
const BUILD_DIR = path.join(OUT, 'build')
const widths = (list(args.widths).map(Number).filter(Boolean).length ? list(args.widths).map(Number) : [390, 1440])
const only = args.only ? String(args.only) : null
const scenes = only ? SCENES.filter((s) => s.slug === only) : SCENES
if (!scenes.length) { console.error(`[iso-shots] aucune scène ne correspond à --only (${SCENES.map((s) => s.slug).join(', ')})`); process.exit(2) }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)) }); s.on('error', rej) })
async function waitUp(url, ms = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { try { const r = await fetch(url); if (r.status < 500) return } catch { /* retry */ } await sleep(200) }
  throw new Error('server unreachable: ' + url)
}

// ---------- styles de la planche ----------
const PAGE_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #0f1117; color: #e2e8f0;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; }
  .gallery { padding: 16px; }
  .gallery-head h1 { font-size: 20px; margin: 0 0 4px; }
  .gallery-head p { font-size: 12px; color: #9ca3af; margin: 0 0 14px; }
  .grid { display: grid; gap: 14px; grid-template-columns: 1fr; }
  @media (min-width: 720px) { .grid { grid-template-columns: repeat(2, 1fr); } }
  @media (min-width: 1100px) { .grid { grid-template-columns: repeat(3, 1fr); } }
  @media (min-width: 1400px) { .grid { grid-template-columns: repeat(4, 1fr); } }
  .tile { border: 1px solid #232936; border-radius: 10px; overflow: hidden; background: #161a23;
    display: flex; flex-direction: column; }
  .tile-stage { position: relative; height: 300px; background: #0f1117; overflow: hidden; }
  @media (min-width: 800px) { .tile-stage { height: 340px; } }
  /* Le stage (IsoStage) et son canvas/SVG doivent remplir la tuile : les utilitaires
     Tailwind absents du bundle sont rejoués ici par ces sélecteurs descendants.
     La chaîne de hauteurs est explicite jusqu'au canvas : une hauteur en pourcentage
     ne résout qu'à travers des parents à hauteur définie (iso-scene puis role=img). */
  .tile-stage [data-testid="iso-scene"] { height: 100%; }
  .tile-stage [role="img"] { position: relative; width: 100%; height: 100%; }
  .tile-stage [role="img"] > div { position: absolute; inset: 0; width: 100%; height: 100%; }
  .tile-stage canvas { display: block; width: 100% !important; height: 100% !important; }
  .tile-stage [data-testid="iso-scene-svg"] { position: absolute; inset: 0; width: 100%; height: 100%; }
  .tile-stage button { display: none !important; }
  .tile-caption { padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 4px; }
  .tile-id { display: flex; align-items: baseline; gap: 8px; }
  .tile-id code { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 11px; color: #7dd3fc; }
  .tile-title { font-size: 13px; font-weight: 600; }
  .tile-meta { font-size: 11px; color: #fbbf24; font-family: ui-monospace, Menlo, monospace; }
  .tile-intent { font-size: 11px; color: #9ca3af; line-height: 1.4; }
  [data-testid="iso-scene-refused"] { color: #fbbf24; background: rgba(251,191,36,.06);
    border: 1px solid rgba(251,191,36,.25); border-radius: 8px; padding: 10px 12px; font-size: 11px; }
  [data-testid="iso-scene-refused"] .flex { display: flex; align-items: center; gap: 6px; color: #fbbf24; }
  [data-testid="iso-scene-refused"] ul { margin: 6px 0 0; padding-left: 18px; list-style: disc; color: #d1d5db; }
  [data-testid="iso-scene-refused"] li { margin: 2px 0; }
  /* La légende (points de couleur + libellés) déborde du stage à hauteur fixe ; le
     titre et l'intention sont déjà sous la tuile : on la masque pour une planche nette. */
  [data-testid="iso-scene-legend"] { display: none !important; }
`

// ---------- alias esbuild ----------
const ALIAS_EXTS = ['.tsx', '.ts', '.jsx', '.js', '.mjs']
const SITE_ISO = path.resolve(ROOT, String(args.site ?? '../website'), 'src', 'three', 'iso')
const ENGINE = args.engine === 'site' ? 'site' : 'vendor'
function resolveAlias(spec) {
  if (spec === '@/i18n') return path.join(SCRIPTS, 'iso-i18n-stub.ts')
  // `--engine=site` : rend le moteur du SITE depuis son arbre de travail, sans passer par la copie vendorisée.
  // C'est ce qui permet de juger un chantier AVANT de le vendoriser — donc avant qu'il atteigne le chat.
  if (ENGINE === 'site' && spec.startsWith('@/vendor/three-iso/')) {
    const name = spec.slice('@/vendor/three-iso/'.length)
    const hit = ['.ts', '.tsx'].map((e) => path.join(SITE_ISO, name + e)).find((p) => fs.existsSync(p))
    if (hit) return hit
  }
  const base = path.join(SRC, spec.slice(2))
  const tries = path.extname(base)
    ? [base]
    : ALIAS_EXTS.flatMap((e) => [base + e, path.join(base, 'index' + e)])
  for (const t of tries) if (fs.existsSync(t)) return t
  return base + '.ts'
}
const aliasPlugin = {
  name: 'iso-alias',
  setup(build) {
    build.onResolve({ filter: /^@\// }, (a) => ({ path: resolveAlias(a.path) }))
  },
}

// ---------- construction de la galerie ----------
async function buildGallery() {
  if (args['no-build'] && fs.existsSync(path.join(BUILD_DIR, 'gallery.js'))) {
    console.log('[iso-shots] bundle de galerie réutilisé (--no-build)')
    return
  }
  console.log('[iso-shots] esbuild de la galerie…')
  await esbuild.build({
    entryPoints: [path.join(SCRIPTS, 'iso-gallery-entry.tsx')],
    outfile: path.join(BUILD_DIR, 'gallery.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    jsx: 'automatic',
    plugins: [aliasPlugin],
    logLevel: 'info',
  })
  const payload = JSON.stringify(scenes.map((s) => ({ slug: s.slug, title: s.title, intent: s.intent, expect: s.expect, data: s.data })))
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Galerie iso_scene</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<div id="root"></div>
<script>window.__ISO_GALLERY__ = ${payload};</script>
<script type="module" src="./gallery.js"></script>
</body>
</html>
`
  fs.writeFileSync(path.join(BUILD_DIR, 'index.html'), html)
}

// ---------- serveur statique minimal ----------
function serve(dir) {
  return new Promise((resolve) => {
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' }
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x')
      let p = path.normalize(path.join(dir, u.pathname === '/' ? 'index.html' : u.pathname))
      if (!p.startsWith(dir)) { res.writeHead(403); res.end(); return }
      if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(dir, 'index.html')
      res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' })
      fs.createReadStream(p).pipe(res)
    })
    server.listen(0, '127.0.0.1', () => resolve({ base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }))
  })
}

// ---------- Chrome sur CDP (repris de qa-shots.mjs) ----------
function chromePath() {
  const p = [args.chrome, ...CHROME_CANDIDATES].filter(Boolean).find((c) => fs.existsSync(c))
  if (!p) throw new Error('Chrome introuvable : régler CHROME_PATH (ou --chrome=<path>)')
  return p
}
async function launchChrome(profileDir) {
  const port = await freePort()
  const child = spawn(chromePath(), [
    '--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=1440,900', `--user-data-dir=${profileDir}`,
    // SwiftShader : un WebGL2 logiciel FIABLE et raisonnablement rapide en headless (le
    // rendu par défaut sans GPU peut être beaucoup plus lent sur les cartes d'ombre).
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank',
  ], { stdio: 'ignore' })
  const http = `http://127.0.0.1:${port}`
  await waitUp(http + '/json/version')
  return { http, close: () => child.exitCode === null && child.kill('SIGKILL') }
}
// Une promesse bornée : les appels CDP ne doivent jamais pendre indéfiniment (Chrome
// headless peut être lent à répondre) — on échoue avec un message clair à la place.
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} (timeout ${ms} ms)`)), ms))])
async function openTab(chrome) {
  const t = await withTimeout((await withTimeout(fetch(`${chrome.http}/json/new?about:blank`, { method: 'PUT' }), 15000, 'création de l\'onglet')).json(), 15000, 'réponse /json/new')
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await withTimeout(new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej }), 15000, 'WebSocket CDP')
  let seq = 0
  const pending = new Map()
  const listeners = new Set()
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) { const { res, rej, to } = pending.get(msg.id); pending.delete(msg.id); clearTimeout(to); msg.error ? rej(new Error(msg.error.message)) : res(msg.result) }
    else if (msg.method) for (const l of listeners) l(msg)
  }
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq
    const to = setTimeout(() => { pending.delete(id); rej(new Error(`CDP ${method} (timeout)`)) }, 120000)
    pending.set(id, { res, rej, to })
    ws.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value
  const close = async () => { try { ws.close() } catch { /* */ } try { await fetch(`${chrome.http}/json/close/${t.id}`) } catch { /* */ } }
  return { send, evaluate, on: (l) => listeners.add(l), close }
}

// ---------- capture d'une planche ----------
async function capture(chrome, base, width, dir) {
  const tab = await openTab(chrome)
  const vp = VIEWPORTS[width] || { width, height: 900 }
  const consoleErrors = []
  try {
    tab.on((msg) => {
      if (msg.method === 'Runtime.exceptionThrown') {
        consoleErrors.push(String(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || '').split('\n').slice(0, 3).join(' ').replace(/\s+/g, ' ').slice(0, 300))
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')
        consoleErrors.push(text.replace(/\s+/g, ' ').slice(0, 300))
      }
    })
    await tab.send('Page.enable')
    await tab.send('Runtime.enable')
    // Viewport normal : chaque tuile tire une image WebGL SYNCHRONE au montage (pas
    // d'IntersectionObserver ni d'animation à fiabiliser). `captureBeyondViewport`
    // capture toute la planche (contenu réel), pas le seul viewport.
    await tab.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: width < 600 })
    // BUILT=<0..1> : tire un instant de la CONSTRUCTION (0 = rien, 1 = fini), pour juger les ouvriers au travail.
    const q = process.env.BUILT ? '?built=' + process.env.BUILT : ''
    await tab.send('Page.navigate', { url: base + '/' + q })
    // La galerie tire les scènes puis pose window.__ISO_READY__.
    const t0 = Date.now()
    let ready = false
    while (Date.now() - t0 < 180000) {
      ready = await tab.evaluate('!!(window.__ISO_READY__)')
      if (ready) break
      await sleep(250)
    }
    if (!ready) throw new Error('la galerie ne s\'est jamais stabilisée (window.__ISO_READY__)')
    await sleep(300)
    const shot = await tab.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    const file = `iso-${width}.png`
    fs.writeFileSync(path.join(dir, file), Buffer.from(shot.data, 'base64'))
    const result = await tab.evaluate('window.__ISO_GALLERY_RESULT__')
    return { file, result, consoleErrors: consoleErrors.slice(0, 6), width }
  } finally {
    await tab.close()
  }
}

// ---------- rapport ----------
function report(captures, tiles, dir, base) {
  const failures = [], warnings = []
  const md = ['# Galerie iso_scene — planches de revue', '',
    `Date : ${new Date().toISOString()} · base : ${base} · scènes : ${scenes.length}`,
    '',
    'Chaque tuile est le VRAI rendu WebGL 2 du moteur (compileIsoScene → IsoRenderer), machine complète.',
    '`renderer:` dit si c\'est le WebGL 2 ou le repli SVG. `res:` est la résolution réelle de la tuile',
    'rendue (canvas/SVG en pixels).', '',
    '| Slug | Titre | Attendu | Résultat | Renderer | res |',
    '|---|---|---|---|---|---|']
  for (const r of tiles) {
    if (r.error) { failures.push(`${r.slug}: ${r.error}`); md.push(`| ${r.slug} | — | — | **ERREUR** ${r.error} | — | — |`); continue }
    const verdict = r.ok ? 'ok' : `refusé (${r.problems.join(' ; ')})`
    const expect = r.expect === 'refused' ? 'refusé' : 'ok'
    const mismatch = (r.expect === 'ok') !== r.ok
    if (mismatch) failures.push(`${r.slug}: attendu ${expect}, obtenu ${r.ok ? 'ok' : 'refusé'} — ${r.ok ? '' : r.problems.join(' ; ')}`)
    if (r.renderer === 'unknown') failures.push(`${r.slug}: rendu non détecté (ni canvas ni SVG)`)
    if (r.renderer === 'svg' && r.expect === 'ok') warnings.push(`${r.slug}: repli SVG (WebGL indisponible)`)
    md.push(`| ${r.slug} | ${r.title} | ${expect} | ${mismatch ? `**${verdict}**` : verdict} | ${r.renderer} | ${r.res ?? '—'} |`)
  }
  md.push('', '## Planches', '')
  for (const c of captures) {
    if (c.error) { failures.push(`planche ${c.width}: ${c.error}`); md.push(`### ${c.width} px`, '', `ERREUR : ${c.error}`, ''); continue }
    md.push(`### ${c.width} px — machine complète`, '', `![${c.file}](${c.file})`, '')
  }
  for (const c of captures) for (const e of (c.consoleErrors || [])) warnings.push(`planche ${c.width}: console ${e}`)
  const refused = tiles.filter((r) => !r.error && !r.ok)
  const refusedUniq = [...new Map(refused.map((r) => [r.slug, r])).values()]
  if (refusedUniq.length) {
    md.push('## Détail des refus', '')
    for (const r of refusedUniq) md.push(`- **${r.slug}** — ${r.problems.join(' ; ')}`)
    md.push('')
  }
  const verdict = failures.length ? 'FAIL' : 'PASS'
  md.push(`## Verdict : ${verdict}`, '', `${tiles.filter((r) => !r.error).length} tuile(s) · ${failures.length} échec(s) · ${warnings.length} avertissement(s)`, '')
  if (failures.length) { md.push('### Échecs', ''); for (const f of failures) md.push(`- ${f}`); md.push('') }
  if (warnings.length) { md.push('### Avertissements', ''); for (const w of warnings) md.push(`- ${w}`); md.push('') }
  fs.writeFileSync(path.join(dir, 'index.md'), md.join('\n'))
  fs.writeFileSync(path.join(dir, 'gallery.json'), JSON.stringify({
    verdict, generatedAt: new Date().toISOString(), widths,
    scenes: tiles.filter((r) => !r.error).map((r) => ({ slug: r.slug, title: r.title, expect: r.expect, ok: r.ok, renderer: r.renderer, res: r.res, problems: r.problems })),
    captures: captures.filter((c) => !c.error).map((c) => ({ width: c.width, file: c.file })),
  }, null, 2))
  const line = '-'.repeat(60)
  console.log(`\n${line}\nISO-SHOTS : ${verdict}  ${scenes.length} scène(s) × ${widths.join('/')} px\n${line}`)
  for (const f of failures) console.log('  FAIL ' + f)
  for (const w of warnings.slice(0, 20)) console.log('  warn ' + w)
  console.log(`  ${path.join(dir, 'index.md')}`)
  return failures.length ? 1 : 0
}

// ---------- main ----------
let server, chrome
const cleanup = () => { try { chrome?.close() } catch { /* */ } try { server?.close() } catch { /* */ } }
process.on('SIGINT', () => { cleanup(); process.exit(130) })
try {
  fs.mkdirSync(BUILD_DIR, { recursive: true })
  for (const f of fs.readdirSync(OUT)) if (/\.(png|md|json)$/.test(f)) fs.rmSync(path.join(OUT, f))
  await buildGallery()
  server = await serve(BUILD_DIR)
  const profile = path.join(OUT, '.chrome-profile')
  fs.rmSync(profile, { recursive: true, force: true })
  chrome = await launchChrome(profile)
  console.log(`[iso-shots] ${scenes.length} scène(s) × ${widths.join('/')} px sur ${server.base}`)
  const captures = []
  const tiles = []
  for (const width of widths) {
    try {
      const r = await capture(chrome, server.base, width, OUT)
      captures.push({ width, file: r.file, consoleErrors: r.consoleErrors })
      const ts = (r.result || []).map((t) => ({ width, ...t }))
      tiles.push(...ts)
      console.log(`  planche ${String(width).padEnd(4)} → ${r.file}  (${ts.length} tuiles)`)
      for (const t of ts) {
        const flag = t.ok ? (t.expect === 'ok' ? 'ok ' : 'SURPRISE-ok') : (t.expect === 'refused' ? 'refusé' : 'REFUS')
        console.log(`    ${flag.padEnd(11)} ${t.slug.padEnd(24)} renderer=${t.renderer.padEnd(7)} res=${t.res ?? '—'}`)
      }
    } catch (e) {
      captures.push({ width, error: String(e.message || e) })
      console.log(`  ERR ${width}: ${e.message || e}`)
    }
  }
  const code = report(captures, tiles, OUT, server.base)
  cleanup()
  try { fs.rmSync(profile, { recursive: true, force: true }) } catch { /* Chrome peut encore tenir le profil */ }
  process.exit(code)
} catch (e) {
  console.error('[iso-shots] ERROR: ' + (e.stack || e))
  cleanup()
  process.exit(2)
}
