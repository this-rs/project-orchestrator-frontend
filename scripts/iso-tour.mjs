#!/usr/bin/env node
// Contrôle de la TOURNÉE DES VUES. Une animation ne se prouve pas sur une image fixe : elle se prouve par son ÉTAT.
// Le canvas du bloc vivant porte `dataset.view` (iso / front / side / top) tant que la tournée tourne, et `manuel` dès
// que le lecteur a pris la main.
//
//   node scripts/iso-tour.mjs [--slug=free-robot] [--seconds=14] [--takeover=9]
//
// Ce qui est vérifié, et qui échoue si ce n'est pas le cas :
//   1. au moins DEUX vues distinctes sont annoncées avant le geste (la tournée tourne vraiment) ;
//   2. après un pointerdown synthétique, la vue ne change plus (elle a rendu la main) ;
//   3. la séquence est celle du cycle iso → front → side → top.
// Mécanique Chrome par CDP, mêmes règles que iso-shots.mjs : pas de Playwright, aucune dépendance.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { userInfo } from 'node:os'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUILD = path.join(ROOT, 'qa-out', 'iso', 'build')
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true] }))
const slug = String(args.slug ?? 'free-robot')
const seconds = Number(args.seconds ?? 14)
const takeover = Number(args.takeover ?? 9)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const CHROME = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p))
if (!CHROME) { console.error('Chrome introuvable'); process.exit(2) }

// --- bundle (mêmes alias que iso-shots) ---
const stub = path.join(ROOT, 'scripts', 'iso-i18n-stub.ts')
const sceneFile = path.join(ROOT, 'scripts', 'iso-gallery.mjs')
const entry = path.join(BUILD, 'tour-entry.tsx')
fs.mkdirSync(BUILD, { recursive: true })
fs.writeFileSync(entry, [
  `import { createRoot } from 'react-dom/client'`,
  `import IsoSceneViz from '@/components/chat/viz/iso/IsoSceneViz'`,
  `import { SCENES } from ${JSON.stringify(sceneFile)}`,
  `const slug = new URLSearchParams(location.search).get('live')`,
  `const sc = (SCENES as { slug: string; data: unknown; title: string }[]).find((s) => s.slug === slug)!`,
  `createRoot(document.getElementById('root')!).render(<div style={{ width: 900, height: 640 }}><IsoSceneViz data={sc.data as Record<string, unknown>} expanded title={sc.title} /></div>)`,
].join('\n'))
await esbuild.build({
  entryPoints: [entry], bundle: true, format: 'esm', jsx: 'automatic', outfile: path.join(BUILD, 'tour.js'), logLevel: 'error',
  plugins: [{ name: 'alias', setup(b) { b.onResolve({ filter: /^@\// }, (a) => { if (a.path === '@/i18n') return { path: stub }; const p = path.join(ROOT, 'src', a.path.slice(2)); for (const c of [p, p + '.ts', p + '.tsx', p + '/index.ts', p + '/index.tsx']) if (fs.existsSync(c)) return { path: c } }) } }],
})
fs.writeFileSync(path.join(BUILD, 'tour.html'), `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#0f1117}</style><div id="root"></div><script type="module" src="./tour.js"></script>`)

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x')
  let p = path.join(BUILD, u.pathname === '/' ? 'index.html' : u.pathname)
  if (!fs.existsSync(p)) p = path.join(BUILD, fs.existsSync(path.join(BUILD, 'index.html')) ? 'index.html' : 'tour.html')
  res.setHeader('Content-Type', path.extname(p) === '.js' ? 'text/javascript' : 'text/html')
  fs.createReadStream(p).pipe(res)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`
const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => r(port)) }) })
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', `--window-size=900,640`, `--user-data-dir=${fs.mkdtempSync('/tmp/tour-')}`, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore', env: { ...process.env, HOME: userInfo().homedir } })
const up = async (u, ms = 20000) => { const t = Date.now(); for (;;) { try { const r = await fetch(u); if (r.ok) return r } catch {} if (Date.now() - t > ms) throw new Error('chrome'); await sleep(200) } }
await up(`http://127.0.0.1:${port}/json/version`)
const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json()
const ws = new WebSocket(tab.webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let id = 0
const pending = new Map()
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return }
  if (m.method === 'Runtime.exceptionThrown') console.log('EXC', String(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 400))
  if (m.method === 'Runtime.consoleAPICalled') console.log('LOG', m.params.args.map((a) => String(a.value ?? a.description ?? '')).join(' ').slice(0, 300))
}
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value
await send('Runtime.enable')
await send('Page.navigate', { url: `${base}/tour.html?live=${slug}` })

const seen = []
const t0 = Date.now()
let clicked = false
while (Date.now() - t0 < seconds * 1000) {
  const v = await evaluate(`document.querySelector('canvas')?.dataset.view ?? null`)
  if (v && seen[seen.length - 1] !== v) seen.push(v)
  if (!clicked && Date.now() - t0 >= takeover * 1000) {
    clicked = true
    await evaluate(`(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1 })); return true })()`)
  }
  await sleep(400)
}
if (!seen.length) {
  const d = await evaluate("JSON.stringify({canvas: document.querySelectorAll('canvas').length, svg: document.querySelectorAll('svg').length, view: document.querySelector('canvas') ? document.querySelector('canvas').dataset.view : null, html: document.body.innerHTML.length})")
  console.log('diagnostic :', d)
}
const before = seen.filter((v) => v !== 'manuel')
const afterHand = seen.slice(seen.indexOf('manuel'))
const order = ['iso', 'front', 'side', 'top']
const sequenceOk = before.every((v, i) => v === order[i % 4])
const ok = before.length >= 2 && seen.includes('manuel') && sequenceOk && afterHand.length <= 1
console.log(ok ? 'TOUR : PASS' : 'TOUR : FAIL', `— ${before.length} vue(s) avant le geste, main rendue : ${seen.includes('manuel')}, ordre respecté : ${sequenceOk}`)
chrome.kill('SIGKILL')
server.close()
process.exit(ok ? 0 : 1)
