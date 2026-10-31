// Pure logic for the code treemap (no React, no DOM).
// Only reads fields that really exist on graph nodes: pagerank, betweenness,
// riskLevel, churnScore, loc/line_count (when present) and the edges.

export type TreemapPrism = 'risk' | 'knowledge' | 'churn' | 'tasks'
export const TREEMAP_PRISMS: TreemapPrism[] = ['risk', 'knowledge', 'churn', 'tasks']

export interface TmNode {
  id: string
  data: Record<string, unknown>
}
export interface TmEdge {
  source: string
  target: string
  type: string
}

export interface FileMetrics {
  id: string
  path: string
  weight: number
  risk: number
  churn: number
  notes: number
  decisions: number
  tasks: number
  openTasks: number
}

export interface TreeEntry {
  /** Display name (may be a collapsed chain "src/components"). */
  name: string
  /** Full path from the root, '' for the root. */
  path: string
  /** Node id for a file (leaf), undefined for a folder. */
  id?: string
  children: TreeEntry[]
  weight: number
  fileCount: number
  risk: number
  churn: number
  notes: number
  decisions: number
  tasks: number
  openTasks: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
export interface PlacedEntry {
  entry: TreeEntry
  rect: Rect
  /** 0..1, share of the prism metric relative to the strongest sibling. */
  intensity: number
}

const RISK_LEVEL: Record<string, number> = { critical: 1, high: 0.75, medium: 0.4, low: 0.1 }
const DONE_STATUSES = new Set(['completed', 'done', 'cancelled', 'failed', 'skipped'])
const NON_KNOWLEDGE_LINKS = new Set(['IMPORTS', 'CALLS', 'EXTENDS', 'IMPLEMENTS', 'CO_CHANGED', 'CO_CHANGED_TRANSITIVE'])

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

export function filePathOf(n: TmNode): string {
  const p = n.data.path
  if (typeof p === 'string' && p) return p
  return n.id.startsWith('file:') ? n.id.slice(5) : n.id
}

/** Per-file metrics from the graph nodes/edges. Non-file nodes only feed badges. */
export function buildFileMetrics(nodes: TmNode[], edges: TmEdge[]): FileMetrics[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const files = nodes.filter((n) => n.data.entityType === 'file')
  const fileIds = new Set(files.map((f) => f.id))

  const acc = new Map<string, { notes: Set<string>; decisions: Set<string>; tasks: Set<string>; open: Set<string>; cochange: number }>()
  const slot = (id: string) => {
    let s = acc.get(id)
    if (!s) acc.set(id, (s = { notes: new Set(), decisions: new Set(), tasks: new Set(), open: new Set(), cochange: 0 }))
    return s
  }
  for (const e of edges) {
    if (e.type === 'CO_CHANGED' || e.type === 'CO_CHANGED_TRANSITIVE') {
      if (fileIds.has(e.source)) slot(e.source).cochange++
      if (fileIds.has(e.target)) slot(e.target).cochange++
      continue
    }
    if (NON_KNOWLEDGE_LINKS.has(e.type)) continue
    for (const [a, b] of [[e.source, e.target], [e.target, e.source]] as const) {
      if (!fileIds.has(a)) continue
      const other = byId.get(b)
      const t = other?.data.entityType
      if (!other) continue
      const s = slot(a)
      if (t === 'note') s.notes.add(b)
      else if (t === 'decision') s.decisions.add(b)
      else if (t === 'task') {
        s.tasks.add(b)
        const st = typeof other.data.status === 'string' ? other.data.status : ''
        if (!DONE_STATUSES.has(st)) s.open.add(b)
      }
    }
  }

  const hasPagerank = files.some((f) => (num(f.data.pagerank) ?? 0) > 0)
  const positives = files.map((f) => num(f.data.pagerank) ?? 0).filter((v) => v > 0)
  const floor = positives.length ? Math.min(...positives) : 0

  return files.map((f) => {
    const s = acc.get(f.id)
    const loc = num(f.data.loc) ?? num(f.data.line_count)
    const pr = num(f.data.pagerank)
    const weight = loc && loc > 0 ? loc : hasPagerank ? Math.max(pr ?? 0, floor) : 1
    const level = typeof f.data.riskLevel === 'string' ? RISK_LEVEL[f.data.riskLevel] : undefined
    const risk = level ?? num(f.data.betweenness) ?? pr ?? 0
    const churn = num(f.data.churnScore) ?? s?.cochange ?? 0
    return {
      id: f.id,
      path: filePathOf(f),
      weight: weight > 0 ? weight : 1,
      risk,
      churn,
      notes: s?.notes.size ?? 0,
      decisions: s?.decisions.size ?? 0,
      tasks: s?.tasks.size ?? 0,
      openTasks: s?.open.size ?? 0,
    }
  })
}

function emptyEntry(name: string, path: string): TreeEntry {
  return { name, path, children: [], weight: 0, fileCount: 0, risk: 0, churn: 0, notes: 0, decisions: 0, tasks: 0, openTasks: 0 }
}

/** Folder -> file tree. Single-child folder chains are collapsed ("a/b"). */
export function buildTree(files: FileMetrics[]): TreeEntry {
  const root = emptyEntry('', '')
  for (const f of files) {
    const parts = f.path.split('/').filter(Boolean)
    if (parts.length === 0) continue
    let cur = root
    const trail: TreeEntry[] = [root]
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts.slice(0, i + 1).join('/')
      let next = cur.children.find((c) => !c.id && c.path === p)
      if (!next) {
        next = emptyEntry(parts[i], p)
        cur.children.push(next)
      }
      cur = next
      trail.push(cur)
    }
    const leaf: TreeEntry = {
      ...emptyEntry(parts[parts.length - 1], parts.join('/')),
      id: f.id, weight: f.weight, fileCount: 1, risk: f.risk, churn: f.churn,
      notes: f.notes, decisions: f.decisions, tasks: f.tasks, openTasks: f.openTasks,
    }
    cur.children.push(leaf)
    for (const t of trail) {
      t.weight += f.weight
      t.fileCount += 1
      t.risk = Math.max(t.risk, f.risk)
      t.churn += f.churn
      t.notes += f.notes
      t.decisions += f.decisions
      t.tasks += f.tasks
      t.openTasks += f.openTasks
    }
  }
  collapse(root)
  return root
}

function collapse(e: TreeEntry): void {
  for (const c of e.children) {
    while (!c.id && c.children.length === 1 && !c.children[0].id) {
      const only = c.children[0]
      c.name = `${c.name}/${only.name}`
      c.path = only.path
      c.children = only.children
    }
    collapse(c)
  }
}

/** Entry for a folder path as produced by the tree (collapsed paths included). */
export function findEntry(root: TreeEntry, path: string): TreeEntry | null {
  if (!path) return root
  const walk = (e: TreeEntry): TreeEntry | null => {
    if (e.path === path) return e
    for (const c of e.children) {
      if (c.id) continue
      if (path === c.path || path.startsWith(c.path + '/')) return walk(c)
    }
    return null
  }
  return walk(root)
}

export interface Crumb {
  name: string
  path: string
}
/** Root -> ... -> folder trail (root crumb has path ''). */
export function breadcrumbFor(root: TreeEntry, path: string): Crumb[] {
  const trail: Crumb[] = [{ name: '', path: '' }]
  let cur = root
  while (cur.path !== path) {
    const next = cur.children.find((c) => !c.id && (path === c.path || path.startsWith(c.path + '/')))
    if (!next) break
    trail.push({ name: next.name, path: next.path })
    cur = next
  }
  return trail
}

/** Strongest metric of an entry for a given prism. */
export function prismValue(e: TreeEntry, prism: TreemapPrism): number {
  switch (prism) {
    case 'risk': return e.risk
    case 'churn': return e.churn
    case 'knowledge': return e.notes + e.decisions
    case 'tasks': return e.openTasks
  }
}

/** Squarified treemap (Bruls et al.). Items must carry a positive `value`. */
export function squarify<T extends { value: number }>(items: T[], rect: Rect): { item: T; rect: Rect }[] {
  const out: { item: T; rect: Rect }[] = []
  const sorted = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value)
  const total = sorted.reduce((s, i) => s + i.value, 0)
  if (!sorted.length || rect.w <= 0 || rect.h <= 0 || total <= 0) return out
  const scale = (rect.w * rect.h) / total
  let { x, y, w, h } = rect
  let i = 0
  const worst = (areas: number[], side: number) => {
    const sum = areas.reduce((a, b) => a + b, 0)
    const max = Math.max(...areas)
    const min = Math.min(...areas)
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min))
  }
  while (i < sorted.length) {
    const side = Math.min(w, h)
    const row: number[] = []
    let j = i
    while (j < sorted.length) {
      const a = sorted[j].value * scale
      if (row.length === 0 || worst([...row, a], side) <= worst(row, side)) {
        row.push(a)
        j++
      } else break
    }
    const sum = row.reduce((a, b) => a + b, 0)
    const horizontal = w >= h // lay the row along the short side (left column)
    const thick = side > 0 ? sum / side : 0
    let off = 0
    for (let k = 0; k < row.length; k++) {
      const len = thick > 0 ? row[k] / thick : 0
      out.push({
        item: sorted[i + k],
        rect: horizontal ? { x, y: y + off, w: thick, h: len } : { x: x + off, y, w: len, h: thick },
      })
      off += len
    }
    if (horizontal) { x += thick; w -= thick } else { y += thick; h -= thick }
    i = j
  }
  return out
}

/** Lay out the direct children of a folder; intensity is relative to the strongest sibling. */
export function layoutFolder(folder: TreeEntry, rect: Rect, prism: TreemapPrism): PlacedEntry[] {
  const placed = squarify(folder.children.map((c) => ({ value: c.weight, entry: c })), rect)
  const max = Math.max(0, ...folder.children.map((c) => prismValue(c, prism)))
  return placed.map(({ item, rect: r }) => ({
    entry: item.entry,
    rect: r,
    intensity: max > 0 ? prismValue(item.entry, prism) / max : 0,
  }))
}

const PRISM_TOKEN: Record<TreemapPrism, string> = {
  risk: 'var(--color-error)',
  knowledge: 'var(--color-primary)',
  churn: 'var(--color-warning)',
  tasks: 'var(--color-success)',
}

/** Fill colour: PO token mixed over the raised surface, stronger with intensity. */
export function prismColor(prism: TreemapPrism, intensity: number): string {
  const pct = Math.round(8 + Math.max(0, Math.min(1, intensity)) * 62)
  return `color-mix(in oklab, ${PRISM_TOKEN[prism]} ${pct}%, var(--color-surface-raised))`
}
