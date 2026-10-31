#!/usr/bin/env node
// Render-cost bench of the intelligence 3D graph (Chrome over CDP, no Playwright).
//
//   node scripts/graph-perf.mjs                      vite build, preview, sizes 80/300/1000
//   node scripts/graph-perf.mjs --no-build           reuse dist/
//   … --sizes=300,1000   --chrome=<path>   --out=<file.json>
//
// What it measures, per graph size, on the real page (IntelligenceGraph3D):
//   - scene : objects in the three.js scene (Sprite / Mesh / Points / Line), lights, programs
//   - idle  : render passes in 3 s with nothing happening (the on-demand loop: ~3, the 1 Hz heartbeat)
//   - drag  : render passes in 2 s, JS time per pass, and the page frame interval (rAF) while dragged.
//             A frame is several passes (bloom), so pass counts are not frame counts.
// The renderer is captured through three's devtools hook (`window.__THREE_DEVTOOLS__`,
// dispatched by WebGLRenderer in three >= 0.160), so no debug code ships in the app.
// Output: one JSON document on stdout (and in --out when given). Exit 2 if the bench cannot run.
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { respond } from './qa-fixtures.mjs'

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

async function capture(chrome, base, n) {
  const tab = await openTab(chrome)
  const graph = makeGraph(n)
  const unfixtured = new Set()
  let inflight = 0, lastNet = Date.now(), loaded = false
  try {
    tab.on(async (msg) => {
      if (msg.method === 'Page.loadEventFired') loaded = true
      else if (msg.method === 'Fetch.requestPaused') {
        const { requestId, request } = msg.params
        const pathname = new URL(request.url).pathname
        if (/\.\w{1,5}$/.test(pathname)) { try { await tab.send('Fetch.continueRequest', { requestId }) } catch { /* */ } return }
        inflight++; lastNet = Date.now()
        let status = 200, body
        if (/^\/api\/projects\/[^/]+\/graph$/.test(pathname)) body = graph
        else { const r = respond('app', request.method, request.url); status = r.status; body = r.body; if (!r.matched) unfixtured.add(`${request.method} ${pathname}`) }
        try {
          await tab.send('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') })
        } catch { /* tab gone */ }
        inflight--; lastNet = Date.now()
      }
    })
    await tab.send('Page.enable'); await tab.send('Runtime.enable')
    await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: DEVTOOLS_HOOK })
    await tab.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }, { urlPattern: '*/auth/*', requestStage: 'Request' }] })
    await tab.send('Emulation.setDeviceMetricsOverride', { width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: 1, mobile: false })
    const tNav = Date.now()
    await tab.send('Page.navigate', { url: base + ROUTE })

    // wait: loaded, no API traffic, and a renderer observed with a stable draw-call count
    const t0 = Date.now()
    while (Date.now() - t0 < 30000 && (!loaded || inflight > 0 || Date.now() - lastNet < 800 || !(await tab.evaluate(PROBE)))) await sleep(200)
    // Time from navigation to a stable first render (includes ~0.8 s network-idle padding).
    const loadMs = Date.now() - tNav
    // the force layout runs for cooldownTime (5 s) after mount: idle is only meaningful once it has stopped
    await sleep(SETTLE)

    const probe0 = await tab.evaluate(PROBE)
    // main-thread blocking during load (longtask API): the build's cost the user feels
    const longTasks = await tab.evaluate('(() => { const d = (window.__LT || []).slice(); return { n: d.length, maxMs: d.length ? +Math.max(...d).toFixed(1) : 0, totalMs: +d.reduce((a, b) => a + b, 0).toFixed(1) } })()')

    // idle: frames in 3 s with no input
    const f0 = await tab.evaluate('window.__POR.info.render.frame')
    await sleep(3000)
    const idleRenders = (await tab.evaluate('window.__POR.info.render.frame')) - f0

    // drag: rotate the camera for ~2 s, sample the renderer counters during the gesture
    const box = await tab.evaluate('(() => { const c = document.querySelector("canvas"); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()')
    if (!box) throw new Error('no canvas on the graph page')
    await tab.evaluate('window.__RT.length = 0; window.__RAF = []')
    await tab.evaluate('window.__CALLERS = []')
    const d0 = await tab.evaluate('window.__POR.info.render.frame')
    await tab.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 })
    const samples = []
    for (let i = 0; i < 40; i++) {
      await tab.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x + Math.sin(i / 4) * 120, y: box.y + i * 2, button: 'left', buttons: 1 })
      samples.push(await tab.evaluate(PROBE))
      await sleep(50)
    }
    await tab.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 })
    await sleep(300)
    const dragRenders = (await tab.evaluate('window.__POR.info.render.frame')) - d0
    const calls = samples.filter(Boolean).map((s) => s.calls)
    const callers = await tab.evaluate(`(() => { const c = {}; (window.__CALLERS || []).forEach((k) => { c[k] = (c[k] || 0) + 1 }); window.__CALLERS = null; return Object.entries(c).sort((x, y) => y[1] - x[1]).slice(0, 4) })()`)
    const frame = await tab.evaluate(`(() => { const t = window.__RAF || []; window.__RAF = null; const d = []; for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1]); d.sort((a, b) => a - b); const q = (p) => d.length ? +d[Math.min(d.length - 1, Math.floor(d.length * p))].toFixed(1) : null; return { n: d.length, p50: q(.5), p95: q(.95), max: d.length ? +d[d.length - 1].toFixed(1) : null }; })()`)
    const rt = await tab.evaluate(`(() => { const d = window.__RT.slice().sort((a, b) => a - b); const q = (p) => d.length ? +d[Math.min(d.length - 1, Math.floor(d.length * p))].toFixed(2) : null; return { n: d.length, p50: q(.5), p95: q(.95), max: d.length ? +d[d.length - 1].toFixed(2) : null }; })()`)

    return {
      nodes: n,
      loadMs,
      longTasks,
      unfixtured: [...unfixtured].slice(0, 8),
      renderer: { ...probe0, drawCallsDrag: { min: Math.min(...calls), max: Math.max(...calls) } },
      idle: { passesIn3s: idleRenders },
      drag: { passesIn2s: dragRenders, passMs: rt, frameIntervalMs: frame, topCallers: callers },
    }
  } finally {
    await tab.close()
  }
}

// ---------- main ----------
let server, chrome
const cleanup = () => { try { chrome?.close() } catch { /* */ } try { server?.close() } catch { /* */ } }
process.on('SIGINT', () => { cleanup(); process.exit(130) })
try {
  build()
  server = await preview()
  const profile = path.join(ROOT, '.graph-perf-profile')
  fs.rmSync(profile, { recursive: true, force: true })
  chrome = await launchChrome(profile)
  const rows = []
  for (const n of SIZES) {
    try { rows.push(await capture(chrome, server.base, n)) } catch (e) { rows.push({ nodes: n, error: String(e.message || e) }) }
  }
  const doc = { when: new Date().toISOString(), viewport: VIEWPORT, rows }
  const text = JSON.stringify(doc, null, 2)
  if (args.out) fs.writeFileSync(path.resolve(args.out), text)
  console.log(text)
  fs.rmSync(profile, { recursive: true, force: true })
  cleanup()
  process.exit(rows.some((r) => r.error) ? 2 : 0)
} catch (e) {
  console.error('[graph-perf] ERROR: ' + (e.stack || e))
  cleanup()
  process.exit(2)
}
