// Fixture API for the visual QA bench (scripts/qa-shots.mjs): what the backend
// would answer for each screen. Served from inside the browser (CDP `Fetch`
// interception), so `vite preview` runs untouched and no port has to be free.
//
// Shapes follow src/types (Plan, TaskWithPlan, Note, Workspace, ChatSession…).
// `/api/attention` reuses the shared backend fixture
// src/services/__fixtures__/attention/four_bands.json (same workspace slugs).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const attention = JSON.parse(readFileSync(path.join(ROOT, 'src/services/__fixtures__/attention/four_bands.json'), 'utf8'))

export const WS = 'acme-freelance'
export const PLAN_ID = '1c2c673f-032c-575a-b916-2a94bee1a2fd'
export const SESSION_ID = 'd3f8df68-4a9b-5e5a-8eae-1cb87d925acb'
const T0 = '2026-10-01T08:00:00Z'
const page = (items, limit = 50) => ({ items, total: items.length, limit, offset: 0, has_more: false })

const workspaces = attention.lanes.map((l, i) => ({
  id: l.id, name: l.name, slug: l.slug, created_at: '2026-01-01T00:00:00Z', updated_at: T0,
  description: i === 0 ? 'Freelance work: invoicing, the client site, the paperwork that follows.' : undefined,
}))
const projects = [
  { id: 'p-1', name: 'Billing', slug: 'billing', root_path: '/srv/billing', description: 'Invoices and payment reminders.', created_at: T0 },
  { id: 'p-2', name: 'Client site', slug: 'client-site', description: 'A planning-only project: no code.', created_at: T0 },
]
const plans = [
  { id: PLAN_ID, title: 'Facturation automatique', description: 'Generate and send the monthly invoices without a hand on the keyboard.', status: 'in_progress', created_at: T0, created_by: 'theo', priority: 8, project_id: 'p-1' },
  { id: 'plan-2', title: 'Refonte du site client', description: 'New home page, a page per service, a form that reaches the inbox.', status: 'approved', created_at: T0, created_by: 'theo', priority: 5, project_id: 'p-2' },
  { id: 'plan-3', title: 'Comptabilité de fin d\'année', description: 'Collect the receipts, reconcile, hand the folder to the accountant.', status: 'draft', created_at: T0, created_by: 'theo', priority: 3 },
  { id: 'plan-4', title: 'Migration des relances', description: 'Done last month.', status: 'completed', created_at: '2026-09-01T08:00:00Z', created_by: 'theo', priority: 2, project_id: 'p-1' },
]
const task = (id, title, status, extra = {}) => ({
  id, title, description: `${title}: what has to be true when this is done.`, status, tags: ['billing'], acceptance_criteria: ['It works on a phone.'],
  affected_files: [], priority: 5, created_at: T0, updated_at: T0, plan_id: PLAN_ID, plan_title: plans[0].title, plan_status: 'in_progress', ...extra,
})
const tasks = [
  task('1ad345a3-b7c7-5da1-88cb-ae05db3cd806', 'Lire les factures du mois', 'completed', { priority: 8 }),
  task('7adde485-6856-5829-9e72-fb8f9e1a5b5d', 'Générer le PDF', 'completed', { priority: 7 }),
  task('t-3', 'Envoyer par e-mail au client', 'in_progress', { priority: 9, assigned_to: 'agent:billing' }),
  task('t-4', 'Relancer après 30 jours', 'blocked', { priority: 6 }),
  task('t-5', 'Archiver dans le dossier comptable', 'pending', { priority: 4 }),
  task('t-6', 'Un titre de tâche assez long pour aller à la ligne deux fois sur un téléphone de 390 pixels de large', 'pending', { priority: 2 }),
]
const notes = [
  { id: 'n-1', project_id: 'p-1', note_type: 'gotcha', status: 'active', importance: 'high', content: '## Les factures de septembre ont deux TVA\n\nLe client suisse est hors UE : pas de TVA, mais la mention légale doit figurer.', tags: ['tva', 'client-ch'], anchors: [], created_at: T0, created_by: 'theo', staleness_score: 0.1 },
  { id: 'n-2', project_id: 'p-1', note_type: 'guideline', status: 'needs_review', importance: 'medium', content: 'Toujours relire le PDF avant envoi : le numéro de facture est séquentiel et ne se corrige pas.', tags: ['process'], anchors: [], created_at: '2026-08-10T08:00:00Z', created_by: 'theo', staleness_score: 0.6 },
  { id: 'n-3', project_id: 'p-2', note_type: 'context', status: 'active', importance: 'low', content: 'Le site tourne encore sur l\'ancien hébergeur jusqu\'à décembre.', tags: [], anchors: [], created_at: '2026-09-20T08:00:00Z', created_by: 'theo', staleness_score: 0.2 },
]
const session = { id: SESSION_ID, workspace_slug: WS, project_slug: 'billing', cwd: '/srv/billing', title: 'Session 1 - Facturation automatique', model: 'sonnet', created_at: T0, updated_at: T0, message_count: 0 }
/**
 * A conversation worth tracing (screen `chat-trace`): a turn with a sub-agent and a failed call,
 * two hours of silence, parallel calls, two dozen short turns, and a child session still running.
 * Timestamps are fractional seconds (what the history would carry with millisecond precision).
 */
export const TRACE_ID = '5b0f3c1e-7a2d-4c55-9e1a-2f6b8d4e7a10'
export const TRACE_CHILD_ID = '9c1d2e3f-4a5b-4c6d-8e7f-a0b1c2d3e4f5'
// Relative to the moment the bench runs: the child session started 70 s ago and is still running.
const TRACE_T = Math.floor(Date.now() / 1000) - (2 * 3600 + 13 * 60 + 40 + 70)
function traceHistory() {
  const ev = []
  const at = (t) => TRACE_T + t
  const user = (t, content) => ev.push({ type: 'user_message', id: `u-${ev.length}`, content, created_at: at(t) })
  const call = (id, tool, input, t0, t1, extra = {}) => {
    ev.push({ type: 'tool_use', id, tool, input, created_at: at(t0), ...(extra.parent && { parent_tool_use_id: extra.parent }) })
    if (t1 != null) ev.push({ type: 'tool_result', id, result: extra.result ?? 'ok', is_error: !!extra.error, created_at: at(t1), ...(extra.parent && { parent_tool_use_id: extra.parent }) })
  }
  const done = (t, ms) => ev.push({ type: 'result', duration_ms: ms, created_at: at(t) })
  user(0, 'Prépare la facture de septembre pour le client suisse')
  call('t-read', 'Read', { file_path: 'invoices/2026-09.csv' }, 0.42, 0.91)
  call('t-grep', 'Grep', { pattern: 'TVA', path: 'templates/' }, 1.02, 1.34)
  ev.push({ type: 'tool_use', id: 't-agent', tool: 'Task', input: { description: 'Vérifier les mentions légales' }, created_at: at(1.5) })
  call('t-a1', 'Read', { file_path: 'legal/ch.md' }, 2.01, 2.63, { parent: 't-agent' })
  call('t-a2', 'Bash', { command: 'pdftotext template.pdf -' }, 2.8, 6.12, { parent: 't-agent', error: true, result: 'pdftotext: command not found' })
  call('t-a3', 'Write', { file_path: 'legal/notes.md' }, 6.5, 7.21, { parent: 't-agent' })
  ev.push({ type: 'tool_result', id: 't-agent', result: 'Mention « hors UE » requise.', created_at: at(9.02) })
  call('t-bash', 'Bash', { command: 'npm run invoice -- --month 2026-09' }, 9.3, 10.42)
  ev.push({ type: 'assistant_text', content: 'Facture prête.', created_at: at(10.6) })
  done(10.7, 10_700)
  const H = 2 * 3600 + 13 * 60
  user(H, 'Envoie-la au client et archive le PDF')
  call('t-web', 'WebFetch', { url: 'https://client.example/contacts' }, H + 0.3, H + 3.12)
  call('t-mail', 'mcp__mail__send', { to: 'compta@client.example' }, H + 0.41, H + 2.8)
  call('t-arch', 'Bash', { command: 'mv out/2026-09.pdf archive/' }, H + 0.52, H + 1.21)
  done(H + 3.4, 3400)
  for (let i = 0; i < 24; i += 1) {
    const t = H + 20 + i * 6
    user(t, `Vérifie la ligne ${i + 1} du relevé`)
    call(`t-r${i}`, 'Read', { file_path: `statements/line-${i + 1}.json` }, t + 0.2, t + 0.55)
    call(`t-g${i}`, 'Grep', { pattern: `REF-${1000 + i}` }, t + 0.6, t + 1.1 + (i % 4) * 0.4)
    if (i % 5 === 2) call(`t-x${i}`, 'Bash', { command: 'node reconcile.js' }, t + 1.2, t + 4.6, { error: i % 10 === 2 })
    done(t + 5, 5000)
  }
  return ev.map((e, seq) => ({ seq, ...e }))
}
function childHistory() {
  const ev = []
  const at = (t) => TRACE_T + 2 * 3600 + 13 * 60 + 40 + t
  ev.push({ type: 'user_message', id: 'cu-0', content: 'Rapprocher les paiements de septembre', created_at: at(0) })
  ev.push({ type: 'tool_use', id: 'c-1', tool: 'Read', input: { file_path: 'bank/2026-09.csv' }, created_at: at(0.3) })
  ev.push({ type: 'tool_result', id: 'c-1', result: 'ok', created_at: at(0.8) })
  ev.push({ type: 'tool_use', id: 'c-2', tool: 'Bash', input: { command: 'node match-payments.js' }, created_at: at(1.0) })
  return ev.map((e, seq) => ({ seq, ...e }))
}
const traceEvents = { [TRACE_ID]: traceHistory(), [TRACE_CHILD_ID]: childHistory() }
const traceSession = { ...{ workspace_slug: 'acme-freelance', project_slug: 'billing', cwd: '/srv/billing', model: 'claude-sonnet-4-5', provider_id: 'claude-code' }, id: TRACE_ID, title: 'Facture de septembre', created_at: new Date(TRACE_T * 1000).toISOString(), updated_at: new Date(TRACE_T * 1000).toISOString(), message_count: 80 }
const traceMessages = (m, url) => {
  const all = traceEvents[m[1]] ?? []
  const offset = Number(url.searchParams.get('offset') || 0)
  const limit = Number(url.searchParams.get('limit') || 50)
  return { messages: all.slice(offset, offset + limit), total_count: all.length, has_more: offset + limit < all.length, offset, limit }
}
const liveAgents = { generated_at: T0, agents: [], total: 0, waiting_input: 0, streaming: 0, idle: 0 }
const counts = { total: 6, completed: 2, in_progress: 1, blocked: 1, pending: 2, failed: 0, percentage: 33 }

/** Scenario → ordered [method?, pathRegex, body | (match, url) => body]. First match wins. */
const COMMON = [
  ['GET', /^\/api\/workspaces$/, page(workspaces)],
  ['GET', /^\/api\/workspaces\/([^/]+)$/, (m) => workspaces.find((w) => w.slug === m[1]) ?? workspaces[0]],
  ['GET', /^\/api\/workspaces\/[^/]+\/projects$/, projects],
  ['GET', /^\/api\/workspaces\/([^/]+)\/overview$/, (m) => ({ workspace: workspaces.find((w) => w.slug === m[1]) ?? workspaces[0], projects, milestones: [], resources: [], components: [] })],
  ['GET', /^\/api\/projects\/[^/]+\/embeddings\/projection$/, { points: [], synapses: [], skills: [], dimensions: 0, projection_dimensions: 2, method: 'umap' }],
  ['GET', /^\/api\/workspaces\/[^/]+\/milestones$/, page([])],
  ['GET', /^\/api\/projects$/, page(projects)],
  ['GET', /^\/api\/projects\/[^/]+\/milestones$/, page([])],
  ['GET', /^\/api\/projects\/([^/]+)$/, (m) => projects.find((p) => p.slug === m[1] || p.id === m[1]) ?? projects[0]],
  ['GET', /^\/api\/attention$/, attention],
  ['GET', /^\/api\/agents\/live$/, liveAgents],
  ['GET', /^\/api\/runs$/, []],
  ['GET', /^\/api\/progress$/, (_m, url) => Object.fromEntries((url.searchParams.get('ids') || '').split(',').filter(Boolean).map((id) => [id, counts]))],
  ['GET', /^\/api\/plans$/, (_m, url) => { const st = url.searchParams.get('status'); return page(st ? plans.filter((p) => p.status === st) : plans) }],
  ['GET', /^\/api\/plans\/([^/]+)$/, (m) => ({ ...(plans.find((p) => p.id === m[1]) ?? plans[0]), tasks, constraints: [], decisions: [] })],
  ['GET', /^\/api\/plans\/[^/]+\/next-task$/, tasks[4]],
  ['GET', /^\/api\/plans\/[^/]+\/constraints$/, [{ id: 'c-1', constraint_type: 'technical', description: 'Never send an invoice twice: the number is the key.', severity: 'high' }]],
  ['GET', /^\/api\/plans\/[^/]+\/dependency-graph$/, {
    nodes: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, step_count: 3, completed_step_count: t.status === 'completed' ? 3 : 1 })),
    edges: [{ from: tasks[0].id, to: tasks[1].id }, { from: tasks[1].id, to: tasks[2].id }, { from: tasks[2].id, to: tasks[3].id }, { from: tasks[3].id, to: tasks[4].id }],
  }],
  ['GET', /^\/api\/plans\/[^/]+\/commits$/, []],
  ['GET', /^\/api\/plans\/[^/]+\/sessions$/, []],
  ['GET', /^\/api\/plans\/[^/]+\/runs$/, []],
  ['GET', /^\/api\/plans\/[^/]+\/run\/status$/, null, 404],
  ['GET', /^\/api\/plans\/[^/]+\/waves$/, { waves: [], total_waves: 0 }],
  ['GET', /^\/api\/tasks$/, (_m, url) => { const st = url.searchParams.get('status'); const pl = url.searchParams.get('plan_id'); return page(tasks.filter((t) => (!st || t.status === st) && (!pl || t.plan_id === pl))) }],
  ['GET', /^\/api\/tasks\/([^/]+)$/, (m) => ({ ...(tasks.find((t) => t.id === m[1]) ?? tasks[0]), steps: [], decisions: [], commits: [], blockers: [], blocking: [] })],
  ['GET', /^\/api\/notes$/, page(notes)],
  ['GET', /^\/api\/notes\/needs-review$/, { items: notes.filter((n) => n.status === 'needs_review') }],
  ['GET', /^\/api\/decisions\/search$/, []],
  ['GET', new RegExp(`^/api/chat/sessions/(${TRACE_ID}|${TRACE_CHILD_ID})/messages$`), traceMessages],
  ['GET', new RegExp(`^/api/chat/sessions/${TRACE_ID}/tree$`), [
    { session_id: TRACE_ID, depth: 0, is_streaming: false, title: 'Facture de septembre', model: 'claude-sonnet-4-5', provider_id: 'claude-code' },
    { session_id: TRACE_CHILD_ID, parent_session_id: TRACE_ID, depth: 1, is_streaming: true, title: 'Rapprochement des paiements', model: 'deepseek-chat', provider_id: 'native', created_at: new Date((TRACE_T + 2 * 3600 + 13 * 60 + 40) * 1000).toISOString() },
  ]],
  ['GET', new RegExp(`^/api/chat/sessions/${TRACE_ID}$`), traceSession],
  ['GET', /^\/api\/chat\/routing\/decisions$/, []],
  ['GET', /^\/api\/chat\/sessions$/, page([session])],
  ['GET', /^\/api\/chat\/sessions\/[^/]+$/, session],
  ['GET', /^\/api\/chat\/sessions\/[^/]+\/messages$/, { messages: [], total_count: 0, has_more: false, offset: 0, limit: 50 }],
  ['GET', /^\/api\/chat\/sessions\/[^/]+\/children$/, []],
  ['GET', /^\/api\/chat\/sessions\/[^/]+\/tree$/, []],
  ['GET', /^\/api\/chat\/live-activity$/, { generated_at: T0, sessions: {} }],
  ['GET', /^\/api\/chat\/models$/, []],
  ['GET', /^\/api\/chat\/config$/, {}],
  ['GET', /^\/api\/chat\/config\/permissions$/, { mode: 'default' }],
  ['GET', /^\/api\/providers/, page([])],
  ['GET', /^\/api\/chat\/providers/, { providers: [], aliases: [], default: null }],
  // No-auth mode: the client still probes the cookie refresh before /auth/providers
  // answers; an empty 200 means "no token" without triggering forceLogout (a 401 would).
  ['POST', /^\/auth\/refresh$/, {}],
  ['POST', /^\/auth\/ws-ticket$/, null, 401],
  ['POST', /^\/auth\/logout$/, {}],
  ['GET', /^\/api\/version$/, { version: 'qa' }],
  ['GET', /^\/api\/update/, null, 404],
]

const scenarios = {
  app: [
    ['GET', /^\/api\/setup-status$/, { configured: true }],
    ['GET', /^\/auth\/providers$/, { auth_required: false, providers: [], allow_registration: false }],
    ...COMMON,
  ],
  setup: [
    ['GET', /^\/api\/setup-status$/, { configured: false }],
    ['GET', /^\/auth\/providers$/, { auth_required: false, providers: [], allow_registration: false }],
    ['GET', /^\/api\/setup\//, {}],
    ...COMMON,
  ],
  login: [
    ['GET', /^\/api\/setup-status$/, { configured: true }],
    ['GET', /^\/auth\/providers$/, { auth_required: true, providers: [{ type: 'password', name: 'Password' }, { type: 'oidc', name: 'Google' }], allow_registration: true }],
    ['GET', /^\/auth\/me$/, null, 401],
    ['POST', /^\/auth\/refresh$/, null, 401], // before COMMON: a 401 here keeps the bench on /login
    ...COMMON,
  ],
}

/**
 * Resolve one request. Returns { status, body, matched } — `matched: false` is
 * the generic answer (an empty page for a GET, `{}` otherwise), reported by the
 * bench so a missing fixture is visible instead of silently blank.
 */
export function respond(scenario, method, rawUrl) {
  const url = new URL(rawUrl)
  for (const [m, re, body, status = 200] of scenarios[scenario] ?? scenarios.app) {
    if (m && m !== method) continue
    const match = re.exec(url.pathname)
    if (!match) continue
    const b = typeof body === 'function' ? body(match, url) : body
    return { status, body: b === null ? { error: 'not found (fixture)' } : b, matched: true }
  }
  return { status: 200, body: method === 'GET' ? page([]) : {}, matched: false }
}

/** The screens of the bench: slug, label, route, fixture scenario. */
export const SCREENS = [
  { slug: 'today', label: 'Today', route: '/today', scenario: 'app' },
  { slug: 'plans', label: 'Plans', route: `/workspace/${WS}/plans`, scenario: 'app' },
  { slug: 'plan-detail', label: 'Plan detail', route: `/workspace/${WS}/plans/${PLAN_ID}`, scenario: 'app' },
  { slug: 'tasks', label: 'Tasks', route: `/workspace/${WS}/tasks`, scenario: 'app' },
  { slug: 'notes', label: 'Notes', route: `/workspace/${WS}/notes`, scenario: 'app' },
  { slug: 'chat-empty', label: 'Chat (empty session)', route: `/workspace/${WS}/chat/${SESSION_ID}`, scenario: 'app' },
  { slug: 'chat-trace', label: 'Conversation trace (timeline page)', route: `/workspace/${WS}/chat/${TRACE_ID}/timeline`, scenario: 'app' },
  { slug: 'overview', label: 'Workspace overview (timeline)', route: `/workspace/${WS}/overview`, scenario: 'app' },
  { slug: 'vector-space', label: 'Vector space', route: `/workspace/${WS}/projects/billing/intelligence/vector-space`, scenario: 'app' },
  { slug: 'setup-1', label: 'Setup — step 1', route: '/setup', scenario: 'setup' },
  { slug: 'login', label: 'Login', route: '/login', scenario: 'login' },
]
