#!/usr/bin/env node
// Visual QA bench of the app on fixtures — the counterpart of website/scripts/qa.
//
//   npm run qa:shots            vite build, vite preview, 8 screens × 390/1440 px → qa-out/
//   npm run qa:shots -- --no-build          reuse dist/
//   … --screens=today,login --widths=390    a subset
//   … --strict                              tap targets < 36 px fail (default: listed as warnings)
//   … --out=<dir>  --wait=<ms>  --chrome=<path>
//
// Per capture: `document.documentElement.scrollWidth <= innerWidth` (FAIL otherwise),
// interactive targets smaller than 36 × 36 CSS px (selector, text, size), visible
// elements with a `backdrop-filter` (budget ≤ 12, DESIGN.md « Matière »; FAIL above).
// Output: qa-out/index.md + qa-out/<slug>-<width>.png + qa-out/qa-shots.json, in the
// grammar of website/scripts/qa (index.md listing the PNGs, PASS/FAIL per check).
//
// No Playwright: Chrome headless is driven over CDP with Node's global WebSocket, and
// the API is answered from scripts/qa-fixtures.mjs through `Fetch` interception, so
// `vite preview` runs as shipped and no backend or extra port is needed.
// Exit codes: 0 pass, 1 a check failed, 2 the bench itself could not run.
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { SCREENS, respond } from './qa-fixtures.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
// DESIGN.md §10: 36 px on a phone; from `md:` the contract's own icon button is 32 px (`md:size-8`).
const MIN_TARGET = 36
const MIN_TARGET_DESKTOP = 32
const minTarget = (width) => (width < 768 ? MIN_TARGET : MIN_TARGET_DESKTOP)
const BLUR_BUDGET = 12
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
const OUT = path.resolve(args.out || process.env.QA_OUT || path.join(ROOT, 'qa-out'))
const WAIT = Number(args.wait || 1500)
const widths = (list(args.widths).map(Number).filter(Boolean).length ? list(args.widths).map(Number) : [390, 1440])
const wanted = list(args.screens)
const screens = wanted.length ? SCREENS.filter((s) => wanted.includes(s.slug)) : SCREENS
if (!screens.length) { console.error('[qa-shots] no screen matches --screens (' + SCREENS.map((s) => s.slug).join(', ') + ')'); process.exit(2) }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)) }); s.on('error', rej) })
async function waitUp(url, ms = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { try { const r = await fetch(url); if (r.status < 500) return } catch { /* retry */ } await sleep(200) }
  throw new Error('server unreachable: ' + url)
}

// ---------- build + preview ----------
function build() {
  if (args['no-build'] && fs.existsSync(path.join(DIST, 'index.html'))) { console.log('[qa-shots] dist/ reused (--no-build)'); return }
  console.log('[qa-shots] vite build…')
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
  const p = [args.chrome, ...CHROME_CANDIDATES].filter(Boolean).find((c) => fs.existsSync(c))
  if (!p) throw new Error('Chrome not found: set CHROME_PATH (or --chrome=<path>)')
  return p
}
async function launchChrome(profileDir) {
  const port = await freePort()
  const child = spawn(chromePath(), [
    '--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1440,900', `--user-data-dir=${profileDir}`, 'about:blank',
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

// ---------- in-page measurements ----------
const measureScript = (min) => `(() => {
  const d = document.documentElement
  const faded = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) if (parseFloat(getComputedStyle(e).opacity) === 0) return true; return false }
  const vis = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return null; const r = el.getBoundingClientRect(); if (r.width <= 1 || r.height <= 1) return null; if (r.right <= 0 || r.left >= innerWidth) return null; return faded(el) ? null : r }
  const sel = (el) => { const parts = []; for (let e = el; e && e.nodeType === 1 && parts.length < 4; e = e.parentElement) { let s = e.tagName.toLowerCase(); if (e.id) { parts.unshift(s + '#' + e.id); break } const c = typeof e.className === 'string' ? e.className.trim().split(/\\s+/).filter((x) => x && !/[\\[\\]\\(\\)\\/:!]/.test(x)).slice(0, 2).join('.') : ''; parts.unshift(s + (c ? '.' + c : '')) } return parts.join(' > ') }
  const wide = []
  for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (r.width && (r.right > innerWidth + 1 || r.left < -1)) wide.push(sel(el) + ' [' + Math.round(r.left) + '→' + Math.round(r.right) + ']') }
  const small = []
  const inter = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox], [role=switch], [role=option], [tabindex]:not([tabindex="-1"])'
  for (const el of document.querySelectorAll(inter)) {
    if (el.closest('[aria-hidden=true]') || el.disabled || el.closest('[data-qa-tap-ok]')) continue
    // a checkbox / radio wrapped in its <label>: the label is the target
    if (el.tagName === 'INPUT' && /^(checkbox|radio)$/.test(el.type) && el.closest('label')) continue
    const r = vis(el); if (!r) continue
    if (r.width >= ${min} && r.height >= ${min}) continue
    const cs = getComputedStyle(el)
    if (el.tagName === 'A' && cs.display === 'inline') { const p = el.parentElement; const own = (p.textContent || '').replace(el.textContent || '', '').replace(/\\s+/g, ''); if (own.length) continue }
    // pseudo-element hit area (ui \`hitArea\`): after:-inset-y-2.5 adds 20px vertically, 8px horizontally
    const after = getComputedStyle(el, '::after'); let w = r.width, h = r.height
    if (after.content !== 'none' && after.position === 'absolute') {
      const px = (v) => parseFloat(v) || 0
      if (getComputedStyle(el).position === 'static') { let a = el.parentElement; while (a && getComputedStyle(a).position === 'static') a = a.parentElement; if (a) { const ar = a.getBoundingClientRect(); w = ar.width - px(after.left) - px(after.right); h = ar.height - px(after.top) - px(after.bottom) } }
      else { w += -px(after.left) - px(after.right); h += -px(after.top) - px(after.bottom) }
    }
    if (w >= ${min} && h >= ${min}) continue
    small.push({ sel: sel(el), tag: el.tagName.toLowerCase(), text: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim().replace(/\\s+/g, ' ').slice(0, 48), w: Math.round(r.width), h: Math.round(r.height) })
  }
  const blurred = []
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el); const bf = cs.backdropFilter || cs.webkitBackdropFilter
    if (!bf || bf === 'none') continue
    const r = vis(el); if (!r) continue
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue
    if (parseFloat(cs.opacity) === 0) continue
    blurred.push(sel(el))
  }
  const h1 = document.querySelector('h1, .display-2, .display-3')
  return { scrollWidth: d.scrollWidth, innerWidth, scrollHeight: d.scrollHeight, wide: wide.slice(0, 6), small, blurred, title: h1 ? h1.textContent.trim().slice(0, 80) : null, titlePx: h1 ? getComputedStyle(h1).fontSize : null, primaries: document.querySelectorAll('.btn-primary').length }
})()`

async function capture(chrome, base, screen, width, dir) {
  const tab = await openTab(chrome)
  const vp = VIEWPORTS[width] || { width, height: 900 }
  const unfixtured = new Set()
  const consoleErrors = []
  let inflight = 0, lastNet = Date.now(), loaded = false
  try {
    tab.on(async (msg) => {
      if (msg.method === 'Page.loadEventFired') loaded = true
      else if (msg.method === 'Fetch.requestPaused') {
        const { requestId, request } = msg.params
        const pathname = new URL(request.url).pathname
        // `*/auth/*` would also match a static file under such a folder: only JSON routes are answered here.
        if (/\.\w{1,5}$/.test(pathname)) { try { await tab.send('Fetch.continueRequest', { requestId }) } catch { /* */ } return }
        inflight++; lastNet = Date.now()
        const { status, body, matched } = respond(screen.scenario, request.method, request.url)
        if (!matched) unfixtured.add(`${request.method} ${new URL(request.url).pathname}`)
        try {
          await tab.send('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') })
        } catch { /* tab gone */ }
        inflight--; lastNet = Date.now()
      } else if (msg.method === 'Runtime.exceptionThrown') {
        consoleErrors.push(String(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || '').split('\n').slice(0, 3).join(' ').replace(/\s+/g, ' ').slice(0, 300))
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')
        if (!/WebSocket|ws:\/\//i.test(text)) consoleErrors.push(text.replace(/\s+/g, ' ').slice(0, 300))
      }
    })
    await tab.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }, { urlPattern: '*/auth/*', requestStage: 'Request' }] })
    await tab.send('Page.enable'); await tab.send('Runtime.enable')
    await tab.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: width < 600 })
    await tab.send('Emulation.setTouchEmulationEnabled', { enabled: width < 600 })
    await tab.send('Page.navigate', { url: base + screen.route })
    // settle: page loaded, no API request for 600 ms, DOM stable for 400 ms (skeletons gone), then the fixed wait (fonts, reveals)
    const t0 = Date.now()
    while (Date.now() - t0 < 10000 && (!loaded || inflight > 0 || Date.now() - lastNet < 600)) await sleep(100)
    let nodes = -1
    while (Date.now() - t0 < 20000) {
      // an empty #root or a skeleton (.animate-pulse) is not a settled page
      const n = await tab.evaluate('(document.getElementById("root")?.childElementCount ? 0 : 100000) + document.querySelectorAll("*").length + (document.querySelector(".animate-pulse") ? 100000 : 0)')
      if (n === nodes && n < 100000) break
      nodes = n
      await sleep(400)
    }
    await sleep(WAIT)
    await tab.evaluate('window.scrollTo(0, 0)')
    const m = await tab.evaluate(measureScript(minTarget(width)))
    const shot = await tab.send('Page.captureScreenshot', { format: 'png' })
    const file = `${screen.slug}-${width}.png`
    fs.writeFileSync(path.join(dir, file), Buffer.from(shot.data, 'base64'))
    const finalUrl = await tab.evaluate('location.pathname + location.search')
    return { ...m, file, finalUrl, unfixtured: [...unfixtured], consoleErrors: consoleErrors.slice(0, 5) }
  } finally {
    await tab.close()
  }
}

// ---------- report ----------
function report(rows, dir, base) {
  const failures = [], warnings = []
  const md = [`# QA shots — the app on fixtures`, '', `Date : ${new Date().toISOString()} · base : ${base} · dist : ${path.relative(ROOT, DIST)}`, '',
    `Checks per capture : no horizontal scroll (\`scrollWidth <= innerWidth\`) · interactive targets ≥ ${MIN_TARGET} px on a phone, ≥ ${MIN_TARGET_DESKTOP} px from 768 px (DESIGN.md §10${args.strict ? ', strict' : ', warnings'}) · visible \`backdrop-filter\` ≤ ${BLUR_BUDGET} (DESIGN.md « Matière »).`, '',
    '| Screen | Width | Scroll | Small targets | Blurs | Title (px) | Primary buttons | Capture |', '|---|---|---|---|---|---|---|---|']
  for (const r of rows) {
    if (r.error) { failures.push(`${r.screen.label} @${r.width}: ${r.error}`); md.push(`| ${r.screen.label} | ${r.width} | — | — | — | — | — | ERROR ${r.error} |`); continue }
    const scrollOk = r.scrollWidth <= r.innerWidth
    const blurOk = r.blurred.length <= BLUR_BUDGET
    if (!scrollOk) failures.push(`${r.screen.label} @${r.width}: horizontal scroll ${r.scrollWidth} > ${r.innerWidth} — ${r.wide.join(' ; ')}`)
    if (!blurOk) failures.push(`${r.screen.label} @${r.width}: ${r.blurred.length} blurred elements visible (budget ${BLUR_BUDGET})`)
    for (const s of r.small) (args.strict ? failures : warnings).push(`${r.screen.label} @${r.width}: ${s.w}×${s.h} <${s.tag}> "${s.text}"  ${s.sel}`)
    if (r.finalUrl.split('?')[0] !== r.screen.route) warnings.push(`${r.screen.label} @${r.width}: landed on ${r.finalUrl} (asked ${r.screen.route})`)
    for (const u of r.unfixtured) warnings.push(`${r.screen.label} @${r.width}: no fixture for ${u} (generic empty answer)`)
    for (const e of r.consoleErrors) warnings.push(`${r.screen.label} @${r.width}: console ${e}`)
    md.push(`| ${r.screen.label} | ${r.width} | ${scrollOk ? 'ok' : `**KO ${r.scrollWidth}/${r.innerWidth}**`} | ${r.small.length} | ${blurOk ? r.blurred.length : `**${r.blurred.length}**`} | ${r.title ? `${r.title.slice(0, 32)} (${r.titlePx})` : '—'} | ${r.primaries} | ![${r.file}](${r.file}) |`)
  }
  md.push('')
  for (const screen of screens) {
    const rs = rows.filter((r) => r.screen === screen && !r.error)
    if (!rs.length) continue
    md.push(`## ${screen.label} — \`${screen.route}\``, '')
    for (const r of rs) {
      md.push(`### ${r.width} px`, '', `![${r.file}](${r.file})`, '', `- scrollWidth ${r.scrollWidth} / innerWidth ${r.innerWidth}${r.wide.length ? ` — overflowing: ${r.wide.join(' ; ')}` : ''}`, `- scrollHeight ${r.scrollHeight} px · title « ${r.title ?? '—'} » ${r.titlePx ?? ''} · \`.btn-primary\` × ${r.primaries}`,
        `- blurred elements visible: ${r.blurred.length}${r.blurred.length ? ` — ${[...new Set(r.blurred)].slice(0, 8).join(' ; ')}` : ''}`)
      if (r.small.length) { md.push(`- targets < ${minTarget(r.width)} px (${r.small.length}):`); for (const s of r.small) md.push(`  - ${s.w}×${s.h} \`<${s.tag}>\` « ${s.text || '∅'} » — \`${s.sel}\``) } else md.push(`- targets < ${minTarget(r.width)} px: none`)
      if (r.finalUrl.split('?')[0] !== screen.route) md.push(`- landed on \`${r.finalUrl}\``)
      if (r.unfixtured.length) md.push(`- no fixture (generic empty answer): ${r.unfixtured.join(', ')}`)
      if (r.consoleErrors.length) md.push(`- console errors: ${r.consoleErrors.join(' | ')}`)
      md.push('')
    }
  }
  const verdict = failures.length ? 'FAIL' : 'PASS'
  md.push(`## Verdict : ${verdict}`, '', `${rows.filter((r) => !r.error).length} captures · ${failures.length} failure(s) · ${warnings.length} warning(s)`, '')
  if (failures.length) { md.push('### Failures', ''); for (const f of failures) md.push(`- ${f}`); md.push('') }
  if (warnings.length) { md.push('### Warnings', ''); for (const w of warnings) md.push(`- ${w}`); md.push('') }
  md.push('Exceptions: a target that is deliberately small carries `data-qa-tap-ok` on itself or an ancestor (same convention as the site).', '')
  fs.writeFileSync(path.join(dir, 'index.md'), md.join('\n'))
  fs.writeFileSync(path.join(dir, 'qa-shots.json'), JSON.stringify({ verdict, failures, warnings, rows: rows.map((r) => ({ ...r, screen: r.screen.slug })) }, null, 2))
  const line = '-'.repeat(60)
  console.log(`\n${line}\nQA-SHOTS : ${verdict}  ${rows.length} captures, ${failures.length} failure(s), ${warnings.length} warning(s)\n${line}`)
  for (const f of failures) console.log('  FAIL ' + f)
  for (const w of warnings.slice(0, 40)) console.log('  warn ' + w)
  if (warnings.length > 40) console.log(`  … +${warnings.length - 40} warnings (see index.md)`)
  console.log(`  ${path.join(dir, 'index.md')}`)
  return failures.length ? 1 : 0
}

// ---------- main ----------
let server, chrome
const cleanup = () => { try { chrome?.close() } catch { /* */ } try { server?.close() } catch { /* */ } }
process.on('SIGINT', () => { cleanup(); process.exit(130) })
try {
  fs.mkdirSync(OUT, { recursive: true })
  for (const f of fs.readdirSync(OUT)) if (/\.(png|md|json)$/.test(f)) fs.rmSync(path.join(OUT, f))
  build()
  server = await preview()
  const profile = path.join(OUT, '.chrome-profile')
  fs.rmSync(profile, { recursive: true, force: true })
  chrome = await launchChrome(profile)
  console.log(`[qa-shots] ${screens.length} screens × ${widths.join('/')} px on ${server.base}`)
  const rows = []
  for (const screen of screens) for (const width of widths) {
    try {
      const r = await capture(chrome, server.base, screen, width, OUT)
      rows.push({ screen, width, ...r })
      console.log(`  ${r.scrollWidth <= r.innerWidth && r.blurred.length <= BLUR_BUDGET ? 'ok' : 'KO'}  ${screen.slug.padEnd(12)} @${String(width).padEnd(4)} scroll ${r.scrollWidth}/${r.innerWidth}  small ${r.small.length}  blurs ${r.blurred.length}  ${r.file}`)
    } catch (e) {
      rows.push({ screen, width, error: String(e.message || e) })
      console.log(`  ERR ${screen.slug} @${width}: ${e.message || e}`)
    }
  }
  const code = report(rows, OUT, server.base)
  fs.rmSync(profile, { recursive: true, force: true })
  cleanup()
  process.exit(code)
} catch (e) {
  console.error('[qa-shots] ERROR: ' + (e.stack || e))
  cleanup()
  process.exit(2)
}
