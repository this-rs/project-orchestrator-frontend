import type { FeatureGraphEntity, FeatureGraphRelation } from '@/types'
import { tr } from '@/i18n/lazy'

// ============================================================================
// Making entities speak: humanized title, one-line explanation, file, importance.
// Every helper works with the legacy entity shape (entity_type, entity_id, name, role)
// and uses the enriched fields (file_path, docstring, signature, line_start) when present.
// ============================================================================

type PlainRole = 'entry_point' | 'core_logic' | 'api_surface' | 'data_model' | 'trait_contract' | 'support'

/** A role in words, read when used (so it follows the language on screen). */
function plainRole(role: PlainRole, weight: number): { word: string; plain: string; weight: number } {
  return {
    get word() {
      return tr(`fgModel.rolePlain.${role}.word`)
    },
    get plain() {
      return tr(`fgModel.rolePlain.${role}.plain`)
    },
    weight,
  }
}

export const ROLE_PLAIN: Record<string, { word: string; plain: string; weight: number }> = {
  entry_point: plainRole('entry_point', 6),
  core_logic: plainRole('core_logic', 5),
  api_surface: plainRole('api_surface', 4),
  data_model: plainRole('data_model', 3),
  trait_contract: plainRole('trait_contract', 2),
  support: plainRole('support', 1),
}

const TYPE_NOUN_KEYS = {
  function: 'fgModel.noun.function',
  file: 'fgModel.noun.file',
  struct: 'fgModel.noun.struct',
  enum: 'fgModel.noun.enum',
  trait: 'fgModel.noun.trait',
} as const

/** Last meaningful segment of an identifier ("src/a.rs::Foo::bar" → "bar", "src/a/b.rs" → "b.rs"). */
function lastSegment(raw: string): string {
  let s = raw.trim()
  const colon = s.lastIndexOf('::')
  if (colon >= 0 && colon + 2 < s.length) s = s.slice(colon + 2)
  const slash = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'))
  if (slash >= 0 && slash + 1 < s.length) s = s.slice(slash + 1)
  return s
}

/** "build_system_prompt" → "Build system prompt", "ChatManager" → "Chat manager", "HTTPServer" → "HTTP server". */
export function humanize(raw: string | undefined | null, opts: { stripExtension?: boolean } = {}): string {
  if (!raw) return ''
  let s = lastSegment(raw)
  if (opts.stripExtension) s = s.replace(/\.[A-Za-z0-9]{1,5}$/, '')
  else if (s.includes('.') && /^[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)+$/.test(s)) s = s.slice(s.lastIndexOf('.') + 1)
  const words = s
    .replace(/[_\-\s]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim()
    .split(' ')
    .filter(Boolean)
  if (words.length === 0) return raw.trim()
  const out = words.map((w, i) => (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w) ? w : i === 0 ? w : w.toLowerCase()))
  const first = out[0]
  out[0] = first.length > 1 && first === first.toUpperCase() ? first : first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
  return out.join(' ')
}

/** True when a free-form name looks like a code identifier (snake_case / camelCase / a::path) rather than prose. */
export function looksLikeIdentifier(name: string | undefined | null): boolean {
  if (!name || /\s/.test(name)) return false
  return /[_]|::|\/|[a-z][A-Z]/.test(name) || /^[a-z0-9]+(\.[a-z0-9]+)+$/.test(name)
}

/** Humanizes identifiers, leaves prose names ("Chat streaming") untouched. */
export function humanizeIfCode(name: string | undefined | null): string {
  if (!name) return ''
  return looksLikeIdentifier(name) ? humanize(name) : name
}

// Strips comment markers (triple slash, block comments, hash, triple quotes) and trims the docstring.
export function cleanDocstring(docstring: string | undefined | null): string {
  if (!docstring) return ''
  return docstring
    .split(/\r?\n/)
    .map((l) =>
      l
        .trim()
        .replace(/^(\/\*\*?|\*\/|\/\/[/!]?|\*|#+|"""|''')\s?/, '')
        .replace(/(\*\/|"""|''')$/, '')
        .trim(),
    )
    .join('\n')
    .trim()
}

/** First sentence of a docstring (undefined when empty). */
export function firstSentence(docstring: string | undefined | null, max = 180): string | undefined {
  const para = cleanDocstring(docstring).split(/\n\s*\n/)[0]
  const text = para.split('\n').map((l) => l.trim()).filter(Boolean).join(' ')
  if (!text) return undefined
  const m = text.match(/^(.+?[.!?])(\s|$)/)
  const sentence = (m ? m[1] : text).trim()
  return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence
}

/** File an entity lives in: explicit `file_path`, the entity itself when it is a file, or the path before `::`. */
export function entityFile(e: FeatureGraphEntity): string | undefined {
  if (e.file_path) return e.file_path
  if (e.entity_type === 'file') return e.entity_id
  const i = e.entity_id.indexOf('::')
  if (i > 0) {
    const prefix = e.entity_id.slice(0, i)
    if (prefix.includes('/') || /\.[A-Za-z0-9]{1,5}$/.test(prefix)) return prefix
  }
  return undefined
}

/** Exact code name to show next to the human title. */
export function entityCodeName(e: FeatureGraphEntity): string {
  if (e.name) return e.name
  return e.entity_type === 'file' ? e.entity_id : lastSegment(e.entity_id) || e.entity_id
}

export function entityTitle(e: FeatureGraphEntity): string {
  const base = e.name || e.entity_id
  return humanize(base, { stripExtension: e.entity_type === 'file' }) || base
}

interface ParsedSignature {
  async: boolean
  params: string[]
  returns?: string
}

/** Best-effort read of `fn f(a: A, b: B) -> R` / `def f(a, b) -> R` / `function f(a, b): R`. */
export function parseSignature(signature: string | undefined): ParsedSignature | undefined {
  if (!signature) return undefined
  const open = signature.indexOf('(')
  if (open < 0) return undefined
  let depth = 0
  let close = -1
  for (let i = open; i < signature.length; i++) {
    const c = signature[i]
    if (c === '(' || c === '<' || c === '[') depth++
    else if (c === ')' || c === '>' || c === ']') {
      depth--
      if (depth === 0 && c === ')') {
        close = i
        break
      }
    }
  }
  if (close < 0) return undefined
  const inner = signature.slice(open + 1, close)
  const params: string[] = []
  let d = 0
  let cur = ''
  for (const c of inner) {
    if (c === '<' || c === '(' || c === '[') d++
    if (c === '>' || c === ')' || c === ']') d--
    if (c === ',' && d === 0) {
      params.push(cur)
      cur = ''
    } else cur += c
  }
  if (cur.trim()) params.push(cur)
  const names = params
    .map((p) => p.trim().split(/[:=]/)[0].replace(/^(mut|&|\*)+\s*/, '').trim())
    .filter((n) => n && !/^(&?mut\s+)?&?self$/.test(n) && n !== 'cls' && n !== 'this')
    .map((n) => humanize(n).toLowerCase())
  const rest = signature.slice(close + 1)
  const ret = rest.match(/(?:->|:)\s*([^{;=]+)/)?.[1]?.trim()
  return {
    async: /\basync\b/.test(signature.slice(0, open)),
    params: names,
    returns: ret && ret !== '()' && ret !== 'void' ? ret.replace(/\s+/g, ' ') : undefined,
  }
}

const list = (items: string[]) =>
  items.length <= 1
    ? items.join('')
    : tr('fgModel.listAnd', { head: items.slice(0, -1).join(', '), last: items[items.length - 1] })

export function roleWord(role: string | undefined): string {
  return (role && ROLE_PLAIN[role]?.word) || tr('fgModel.other')
}

/** Deterministic plain-language sentence when no docstring exists. */
export function derivedSummary(e: FeatureGraphEntity): string {
  const sig = e.entity_type === 'function' ? parseSignature(e.signature) : undefined
  const nounKey = TYPE_NOUN_KEYS[e.entity_type as keyof typeof TYPE_NOUN_KEYS]
  let noun = nounKey ? tr(nounKey) : tr('fgModel.noun.other')
  if (sig?.async) noun = tr('fgModel.asyncNoun', { noun: noun.toLowerCase() })
  const file = entityFile(e)
  let out = file && e.entity_type !== 'file' ? tr('fgModel.nounInFile', { noun, file }) : noun
  if (e.entity_type === 'file' && file?.includes('/')) out = tr('fgModel.nounInFile', { noun, file: `${file.slice(0, file.lastIndexOf('/'))}/` })
  if (sig) {
    const takes = sig.params.length ? tr('fgModel.takes', { params: list(sig.params) }) : tr('fgModel.takesNothing')
    out += ` — ${sig.returns ? tr('fgModel.takesReturns', { takes, returns: sig.returns }) : takes}`
  }
  const plain = e.role ? ROLE_PLAIN[e.role]?.plain : undefined
  if (plain) out += ` · ${plain}`
  return out
}

// ----------------------------------------------------------------------------
// Importance
// ----------------------------------------------------------------------------

export type ImportanceLevel = 'key' | 'supporting' | 'minor'

export interface Importance {
  /** 0-1 */
  value: number
  level: ImportanceLevel
  label: string
}

const LEVEL_LABEL_KEYS = {
  key: 'fgModel.level.key',
  supporting: 'fgModel.level.supporting',
  minor: 'fgModel.level.minor',
} as const

export function entityImportance(e: FeatureGraphEntity): Importance {
  let v = e.importance_score
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    // No score: fall back to the role (entry point ≫ helper).
    v = ((e.role && ROLE_PLAIN[e.role]?.weight) || 1) / 6
  } else if (v > 1) v = v / 100
  const value = Math.min(1, Math.max(0, v))
  const level: ImportanceLevel = value >= 0.66 ? 'key' : value >= 0.33 ? 'supporting' : 'minor'
  return { value, level, label: tr(LEVEL_LABEL_KEYS[level]) }
}

// ----------------------------------------------------------------------------
// View model
// ----------------------------------------------------------------------------

export interface EntityView {
  /** Index in the source array (stable identity even when entity_ids repeat). */
  index: number
  entity: FeatureGraphEntity
  title: string
  codeName: string
  file?: string
  typeLabel: string
  role: string
  roleWord: string
  /** One line: first sentence of the docstring, or the derived sentence. */
  summary: string
  fromDocstring: boolean
  importance: Importance
  /** Lower-cased text the search runs over. */
  haystack: string
}

const TYPE_LABEL_KEYS = {
  function: 'fgModel.type.function',
  file: 'fgModel.type.file',
  struct: 'fgModel.type.struct',
  enum: 'fgModel.type.enum',
  trait: 'fgModel.type.trait',
} as const
const TYPE_PLURAL_KEYS = {
  function: 'fgModel.typePlural.function',
  file: 'fgModel.typePlural.file',
  struct: 'fgModel.typePlural.struct',
  enum: 'fgModel.typePlural.enum',
  trait: 'fgModel.typePlural.trait',
} as const
export const typeLabel = (t: string) =>
  t in TYPE_LABEL_KEYS
    ? tr(TYPE_LABEL_KEYS[t as keyof typeof TYPE_LABEL_KEYS])
    : t
      ? t.charAt(0).toUpperCase() + t.slice(1)
      : tr('fgModel.other')
const typePlural = (t: string) => (t in TYPE_PLURAL_KEYS ? tr(TYPE_PLURAL_KEYS[t as keyof typeof TYPE_PLURAL_KEYS]) : `${typeLabel(t)}s`)

export function buildEntityView(entity: FeatureGraphEntity, index: number): EntityView {
  const doc = firstSentence(entity.docstring)
  const title = entityTitle(entity)
  const codeName = entityCodeName(entity)
  const file = entityFile(entity)
  const role = entity.role || 'unknown'
  const summary = doc ?? derivedSummary(entity)
  const tl = typeLabel(entity.entity_type)
  return {
    index,
    entity,
    title,
    codeName,
    file,
    typeLabel: tl,
    role,
    roleWord: roleWord(entity.role),
    summary,
    fromDocstring: !!doc,
    importance: entityImportance(entity),
    haystack: [title, codeName, entity.entity_id, tl, file, entity.docstring, roleWord(entity.role)]
      .filter(Boolean)
      .join('\n')
      .toLowerCase(),
  }
}

export const buildEntityViews = (entities: FeatureGraphEntity[]): EntityView[] => entities.map(buildEntityView)

// ----------------------------------------------------------------------------
// Grouping
// ----------------------------------------------------------------------------

export type GroupBy = 'role' | 'file' | 'type'

export interface EntityGroup {
  key: string
  /** Breadcrumb segments for file groups, a single label otherwise. */
  path: string[]
  label: string
  views: EntityView[]
}

const ROLE_ORDER_LOCAL = ['entry_point', 'core_logic', 'api_surface', 'data_model', 'trait_contract', 'support']
const TYPE_ORDER = ['function', 'file', 'struct', 'trait', 'enum']
const NO_FILE = '￿'

const byImportance = (a: EntityView, b: EntityView) => b.importance.value - a.importance.value || a.index - b.index
const byLine = (a: EntityView, b: EntityView) =>
  (a.entity.line_start ?? Infinity) - (b.entity.line_start ?? Infinity) || byImportance(a, b)

export function groupEntityViews(
  views: EntityView[],
  by: GroupBy,
  roleLabelOf: (role: string) => string,
): EntityGroup[] {
  const map = new Map<string, EntityView[]>()
  for (const v of views) {
    const key = by === 'role' ? v.role : by === 'type' ? v.entity.entity_type || 'other' : (v.file ?? NO_FILE)
    const arr = map.get(key)
    if (arr) arr.push(v)
    else map.set(key, [v])
  }
  let keys = [...map.keys()]
  if (by === 'role') {
    keys = [...ROLE_ORDER_LOCAL.filter((r) => map.has(r)), ...keys.filter((k) => !ROLE_ORDER_LOCAL.includes(k))]
  } else if (by === 'type') {
    keys = [...TYPE_ORDER.filter((r) => map.has(r)), ...keys.filter((k) => !TYPE_ORDER.includes(k))]
  } else {
    keys.sort((a, b) => (a === NO_FILE ? 1 : b === NO_FILE ? -1 : a.localeCompare(b)))
  }
  return keys.map((key) => {
    const items = map.get(key)!
    items.sort(by === 'file' ? byLine : byImportance)
    if (by === 'file') {
      return key === NO_FILE
        ? { key, path: [tr('fgModel.noFile')], label: tr('fgModel.noFile'), views: items }
        : { key, path: key.split('/').filter(Boolean), label: key, views: items }
    }
    const label = by === 'role' ? roleLabelOf(key) : typePlural(key)
    return { key, path: [label], label, views: items }
  })
}

// ----------------------------------------------------------------------------
// Relations index (callers / callees for the detail panel)
// ----------------------------------------------------------------------------

export interface NeighbourRef {
  entityId: string
  relationType: string
}

export interface EntityNeighbours {
  /** Who points at this entity (callers, importers…). */
  incoming: NeighbourRef[]
  /** What this entity points at (callees, imports…). */
  outgoing: NeighbourRef[]
}

export function buildNeighbourIndex(relations: FeatureGraphRelation[]): Map<string, EntityNeighbours> {
  const index = new Map<string, EntityNeighbours>()
  const get = (id: string) => {
    let n = index.get(id)
    if (!n) {
      n = { incoming: [], outgoing: [] }
      index.set(id, n)
    }
    return n
  }
  const seen = new Set<string>()
  for (const r of relations) {
    if (r.source_id === r.target_id) continue
    const key = `${r.source_id}\u0000${r.relation_type}\u0000${r.target_id}`
    if (seen.has(key)) continue
    seen.add(key)
    get(r.source_id).outgoing.push({ entityId: r.target_id, relationType: r.relation_type })
    get(r.target_id).incoming.push({ entityId: r.source_id, relationType: r.relation_type })
  }
  return index
}
