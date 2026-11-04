#!/usr/bin/env node
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { respond } from './qa-fixtures.mjs'
// Fullscreen + resize check of the intelligence 3D graph, on the real page, in Chrome.
//
//   node scripts/graph-fullscreen-check.mjs [--no-build] [--nodes=5000] [--out=<file.json>]
//
// Regression guard for the bug where the graph disappeared from the canvas when the
// graph was taken to fullscreen and back. For each step it checks: the graph is still
// drawing (renderer draw calls > 0), and the canvas fills its container (CSS size).
// Exit 0 when every check passes, 1 when one fails, 2 when the bench cannot run.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
]
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true] }))
const SIZES = String(args.sizes || '80,300,1000').split(',').map(Number).filter(Boolean)
const ROUTE = '/workspace/acme-freelance/projects/billing/intelligence/graph'
const VIEWPORT = { width: 1440, height: 900 }
const SETTLE = Number(args.settle || 8000)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)) }); s.on('error', rej) })
async function waitUp(url, ms = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { try { const r = await fetch(url); if (r.status < 500) return } catch { /* retry */ } await sleep(200) }
  throw new Error('server unreachable: ' + url)
}

// ---------- synthetic graph (deterministic) ----------
function makeGraph(n) {
  let s = 7
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647
  const TYPES = [['file', 'code'], ['function', 'code'], ['struct', 'code'], ['note', 'knowledge'], ['decision', 'knowledge'], ['task', 'pm'], ['skill', 'skills']]
  const nodes = Array.from({ length: n }, (_, i) => {
    const [type, layer] = TYPES[Math.floor(r() * TYPES.length)]
    return { id: `n${i}`, type, label: `${type} ${i}`, layer, attributes: { community: i % 6, pagerank: +(r() * 0.02).toFixed(5), risk_score: +r().toFixed(2), status: 'todo' } }
  })
  const edges = []
  for (let i = 0; i < n * 2; i++) {
    const a = Math.floor(r() * n), b = Math.floor(r() * n)
    if (a !== b) edges.push({ source: `n${a}`, target: `n${b}`, type: 'IMPORTS', layer: 'code', attributes: { weight: +r().toFixed(3) } })
  }
  return {
    nodes, edges,
    communities: Array.from({ length: 6 }, (_, k) => ({ id: k, label: `c${k}`, file_count: Math.round(n / 6) })),
    stats: { code: { nodes: n, edges: edges.length } },
  }
}

// ---------- build + preview ----------
function build() {
  if (args['no-build'] && fs.existsSync(path.join(DIST, 'index.html'))) return
  const r = spawnSync('npx', ['vite', 'build'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) throw new Error('vite build failed')
}
async function preview() {
  const port = await freePort()
  const child = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: 'ignore', shell: process.platform === 'win32' })
  const base = `http://127.0.0.1:${port}`
  await waitUp(base + '/')
  return { base, close: () => child.exitCode === null && child.kill('SIGTERM') }
}

// ---------- chrome over CDP ----------
function chromePath() {
  const p = [args.chrome, process.env.CHROME_PATH, ...CHROME_CANDIDATES].filter(Boolean).find((c) => fs.existsSync(c))
  if (!p) throw new Error('Chrome not found: set CHROME_PATH (or --chrome=<path>)')
  return p
}
async function launchChrome(profileDir) {
  const port = await freePort()
  const child = spawn(chromePath(), [
    '--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--hide-scrollbars', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`, `--user-data-dir=${profileDir}`, 'about:blank',
  ], { stdio: 'ignore' })
  const http = `http://127.0.0.1:${port}`
  await waitUp(http + '/json/version')
  return { http, close: () => child.exitCode === null && child.kill('SIGKILL') }
}
async function openTab(chrome) {
  const t = await (await fetch(`${chrome.http}/json/new?about:blank`, { method: 'PUT' })).json()
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  let seq = 0
  const pending = new Map()
  const listeners = new Set()
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result) }
    else if (msg.method) for (const l of listeners) l(msg)
  }
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })) })
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value
  const close = async () => { try { ws.close() } catch { /* */ } try { await fetch(`${chrome.http}/json/close/${t.id}`) } catch { /* */ } }
  return { send, evaluate, on: (l) => listeners.add(l), close }
}

// Installed before any page script: three then reports every renderer it creates.
// Each renderer.render() call is timed (JS side: scene walk + command submission; with SwiftShader the
// GPU work runs on the CPU too). Renders are counted by three's own info.render.frame, not by rAF.
const DEVTOOLS_HOOK = `window.__LT = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__LT.push(e.duration) }).observe({ type: 'longtask', buffered: true }) } catch { /* */ } window.__THREE_DEVTOOLS__ = new EventTarget(); window.__RAF = null; (function raf(t) { if (window.__RAF) window.__RAF.push(t); requestAnimationFrame(raf); })(performance.now());
window.__POR = null; window.__RT = [];
window.__THREE_DEVTOOLS__.addEventListener('observe', (e) => {
  const R = e.detail; window.__POR = R;
  const orig = R.render;
  R.render = function (...a) { const t = performance.now(); if (window.__CALLERS) window.__CALLERS.push((new Error().stack || "").split("\\n").slice(2, 5).map((l) => l.trim()).join(" < ")); const out = orig.apply(this, a); window.__RT.push(performance.now() - t); if (window.__RT.length > 4000) window.__RT.shift(); return out; };
});`

// Renderer counters of the last frame (autoReset is on: `calls` is one frame's worth).
const PROBE = `(() => {
  const R = window.__POR; if (!R) return null;
  return { frame: R.info.render.frame, calls: R.info.render.calls, triangles: R.info.render.triangles, programs: R.info.programs ? R.info.programs.length : null, geometries: R.info.memory.geometries, textures: R.info.memory.textures };
})()`


import zlib from 'node:zlib'

// Decode an 8-bit RGB/RGBA PNG (what Chrome's screenshots are) and count the pixels
// that differ visibly from the canvas background. Used to see the graph, not to
// trust a draw-call counter: an empty scene still submits draw calls.
function litPixels(png, background = [15, 23, 42], threshold = 60, box = [0.25, 0.25, 0.75, 0.75]) {
  if (png.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')
  let pos = 8, width = 0, height = 0, colorType = 0
  const idat = []
  while (pos < png.length) {
    const len = png.readUInt32BE(pos)
    const type = png.toString('ascii', pos + 4, pos + 8)
    const data = png.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9] }
    if (type === 'IDAT') idat.push(data)
    pos += 12 + len
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
  if (!bpp) throw new Error('unsupported PNG colour type ' + colorType)
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * bpp
  const out = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const src = y * (stride + 1) + 1
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0
      const b = y > 0 ? out[(y - 1) * stride + x] : 0
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0
      let v = raw[src + x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      out[y * stride + x] = v & 0xff
    }
  }
  // only the centre of the canvas: the toolbar, legend and search overlays sit on the edges
  const [fx0, fy0, fx1, fy1] = box
  const x0 = Math.floor(width * fx0), x1 = Math.floor(width * fx1)
  const y0 = Math.floor(height * fy0), y1 = Math.floor(height * fy1)
  let lit = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * bpp
      const d = Math.abs(out[i] - background[0]) + Math.abs(out[i + 1] - background[1]) + Math.abs(out[i + 2] - background[2])
      if (d > threshold) lit++
    }
  }
  return lit
}


const TARGET = '/workspace/acme-freelance/projects/billing/intelligence/graph'
const results = []
const rec = (name, ok, detail) => results.push({ name, ok: !!ok, detail })
let server, chrome
try {
  server = await preview()
  chrome = await launchChrome(path.join(ROOT, '.graph-touch-profile'))
  const tab = await openTab(chrome)
  // paths, so the code map has folders to drill into: file ids under src/dK/
  const graph = makeGraph(5000)
  graph.nodes = graph.nodes.map((n, i) => (n.type === 'file' ? { ...n, id: `file:src/d${i % 12}/f${i}.ts`, label: `f${i}.ts` } : n))
  const ids = new Set(graph.nodes.map((n) => n.id))
  graph.edges = graph.edges.map((e) => ({ ...e, source: ids.has(e.source) ? e.source : `file:src/d${(+e.source.slice(1)) % 12}/f${e.source.slice(1)}.ts`, target: ids.has(e.target) ? e.target : `file:src/d${(+e.target.slice(1)) % 12}/f${e.target.slice(1)}.ts` }))
  let loaded = false, inflight = 0, lastNet = Date.now()
  tab.on(async (msg) => {
    if (msg.method === 'Page.loadEventFired') loaded = true
    if (msg.method === 'Fetch.requestPaused') {
      const { requestId, request } = msg.params
      const pathname = new URL(request.url).pathname
      if (/\.\w{1,5}$/.test(pathname)) { try { await tab.send('Fetch.continueRequest', { requestId }) } catch { /* */ } return }
      inflight++; lastNet = Date.now()
      let status = 200, body
      if (/^\/api\/projects\/[^/]+\/graph$/.test(pathname)) body = graph
      else { const r = respond('app', request.method, request.url); status = r.status; body = r.body }
      try { await tab.send('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') }) } catch { /* */ }
      inflight--; lastNet = Date.now()
    }
  })
  await tab.send('Page.enable'); await tab.send('Runtime.enable')
  await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: DEVTOOLS_HOOK })
  await tab.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }, { urlPattern: '*/auth/*', requestStage: 'Request' }] })
  // a phone: 390x844, device pixel ratio 3, touch emulation on
  if (process.env.DESKTOP) {
    await tab.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  } else {
    await tab.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })
    await tab.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  }
  await tab.send('Page.navigate', { url: server.base + TARGET })
  const t0 = Date.now()
  while (Date.now() - t0 < 30000 && (!loaded || inflight > 0 || Date.now() - lastNet < 1000)) await sleep(200)
  // wait until the code map has its tiles
  for (let i = 0; i < 150; i++) {
    const n = await tab.evaluate(`[...document.querySelectorAll('button')].filter((b) => /^(Ouvrir|Open)/.test(b.getAttribute('aria-label') || '')).length`)
    if (n > 0) break
    await sleep(200)
  }
  await sleep(1000)

  // a real touch tap at the centre of an element (touchStart + touchEnd, as a finger does)
  const tap = async (x, y) => {
    await tab.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
    await sleep(60)
    await tab.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await sleep(450)
  }
  const centreOf = (js) => tab.evaluate(`(() => { const el = ${js}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } })()`)
  // the treemap's own breadcrumb: the current crumb that sits in the same block as the tiles (the sidebar also has aria-current)
  const crumbCurrent = () => tab.evaluate(`(() => { const e = [...document.querySelectorAll('[aria-current="page"]')].find((x) => { const box = x.closest('div.flex.flex-col'); return box && box.querySelector('button[aria-label^="Ouvrir"], button[aria-label^="Open"]') }); return e ? e.textContent.trim() : null })()`)
  // the inspector is open when its collapse control shows the « close » icon
  const inspectorOpen = () => tab.evaluate(`(() => !!document.querySelector('svg.lucide-panel-right-close'))()`)

  // 1. touch folder tiles: each tap must drill in (the tiles change), until a file tile shows
  const labels = () => tab.evaluate(`[...document.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')).filter((l) => /^(Ouvrir|Open)/.test(l || ''))`)
  const firstTile = () => centreOf(`[...document.querySelectorAll('button')].find((b) => /^(Ouvrir|Open)/.test(b.getAttribute('aria-label') || ''))`)
  const drills = []
  let fileOk = false, pressed = false
  for (let step = 0; step < 4 && !fileOk; step++) {
    const fileTile = await centreOf(`[...document.querySelectorAll('button[aria-pressed]')].find((b) => /^(Ouvrir|Open)/.test(b.getAttribute('aria-label') || ''))`)
    if (fileTile) {
      await tap(fileTile.x, fileTile.y)
      fileOk = true
      pressed = await tab.evaluate(`[...document.querySelectorAll('button[aria-pressed="true"]')].some((b) => /^(Ouvrir|Open)/.test(b.getAttribute('aria-label') || ''))`)
      break
    }
    const before = JSON.stringify(await labels())
    const t = await firstTile()
    if (!t) break
    await tap(t.x, t.y)
    const after = JSON.stringify(await labels())
    drills.push({ drilled: before !== after })
  }
  rec('touch: tapping folder tiles drills into them', drills.length > 0 && drills.every((d) => d.drilled), { drills: drills.length })
  rec('touch: tapping a file tile selects it', fileOk && pressed, { reachedFile: fileOk, selectedTileShown: pressed })
  const insp2 = await inspectorOpen()
  rec('touch: tapping a file tile opens the inspector', insp2, { inspector: insp2 })

  // 3. switch to 3D by touch, then tap nodes of the overview tier (the Points pick)
  const v3d = await centreOf(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '3D')`)
  if (v3d) await tap(v3d.x, v3d.y)
  await sleep(4000)
  const canvasBox = await centreOf(`document.querySelector('canvas')`)
  let picked = null
  // close the inspector left open by the file selection, so a 3D pick is what opens it
  if (await inspectorOpen()) {
    const toggle = await centreOf(`[...document.querySelectorAll('button')].find((b) => b.querySelector('svg.lucide-panel-right-close'))`)
    if (toggle) await tap(toggle.x, toggle.y)
  }
  console.log('PRE3D ' + JSON.stringify({ inspectorOpenBefore3D: await inspectorOpen() }))
  {
    // hover uses the same pick as a click: over a node the container's cursor turns to pointer.
  // Sweep a grid across the cloud with the mouse and look for a node under the pointer.
  const el = await centreOf(`document.querySelector('canvas')`)
  let picked = null
  if (el) {
    for (let dy = -300; dy <= 300 && !picked; dy += 30) {
      for (let dx = -150; dx <= 150 && !picked; dx += 30) {
        await tab.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: el.x + dx, y: el.y + dy, button: 'none', buttons: 0 })
        await sleep(120)
        const cur = await tab.evaluate(`(() => { let n = document.querySelector('canvas'); while (n) { if (n.style && n.style.cursor) return n.style.cursor; n = n.parentElement } return '' })()`)
        if (cur === 'pointer') picked = { dx, dy }
      }
    }
  }
  rec('3D overview: a node under the pointer is picked (the cursor turns to pointer)', !!picked, { picked })
  }

  const failed = results.filter((r) => !r.ok)
  console.log('TOUCH_RESULT ' + JSON.stringify({ passed: results.length - failed.length, total: results.length, results }))
  await tab.close()
} finally {
  try { chrome?.close() } catch { /* */ }
  try { server?.close() } catch { /* */ }
}
