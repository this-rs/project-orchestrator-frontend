/**
 * "Fall back to English" merge and message-format helpers. Pure module,
 * shared by the store and by scripts/check-i18n.mjs (copy of the website module).
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

/**
 * Overlay `over` (a possibly partial translation) on `base` (English).
 * Empty, missing or wrongly typed strings fall back to English;
 * arrays merge by index and keep the English length.
 */
export function deepMerge<T>(base: T, over: unknown): T {
  if (over === undefined || over === null) return base
  if (typeof base === 'string') return (typeof over === 'string' && over.trim() !== '' ? over : base) as T
  if (Array.isArray(base)) {
    const src = Array.isArray(over) ? over : []
    return base.map((b, i) => deepMerge(b, src[i])) as T
  }
  if (base !== null && typeof base === 'object') {
    const src = typeof over === 'object' && !Array.isArray(over) ? (over as Record<string, unknown>) : {}
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(base)) out[key] = deepMerge((base as Record<string, unknown>)[key], src[key])
    return out as T
  }
  return base
}

/** Flattens a catalog into `key.path -> string` (arrays use the index). */
export function flatten(value: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (typeof value === 'string') {
    out[prefix] = value
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => flatten(v, prefix ? `${prefix}.${i}` : String(i), out))
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, Json>)) flatten(v, prefix ? `${prefix}.${k}` : k, out)
  }
  return out
}

/** Markers of a message: `{name}` and `<tag>`. Used to compare a translation with English. */
export function placeholdersOf(message: string): string[] {
  const found = new Set<string>()
  for (const m of message.matchAll(/\{(\w+)\}/g)) found.add(`{${m[1]}}`)
  for (const m of message.matchAll(/<(\w+)>[\s\S]*?<\/\1>/g)) found.add(`<${m[1]}>`)
  return [...found].sort()
}

/** Replaces `{name}` with the value; `format` formats numbers. */
export function interpolate(message: string, vars: Readonly<Record<string, string | number>> | undefined, format: (n: number) => string): string {
  if (!vars) return message
  return message.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = vars[name]
    if (v === undefined) return whole
    return typeof v === 'number' ? format(v) : v
  })
}
