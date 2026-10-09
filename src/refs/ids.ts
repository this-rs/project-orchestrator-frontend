/**
 * How the `id` of a reference is spelled, per id format (the `id_format` the
 * server announces for each kind on `GET /api/refs/kinds`). One validator per
 * format, shared by the token reader, the drop, the search and the wire: a
 * reference whose id fails here never reaches the draft.
 */

export type IdFormat = 'uuid' | 'project_commit' | 'project_path' | 'url'
export const ID_FORMATS: readonly IdFormat[] = ['uuid', 'project_commit', 'project_path', 'url']
export const isIdFormat = (v: unknown): v is IdFormat => typeof v === 'string' && (ID_FORMATS as readonly string[]).includes(v)

export const UUID_SOURCE = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
const UUID_RE = new RegExp(`^${UUID_SOURCE}$`)
const NIL_UUID = '00000000-0000-0000-0000-000000000000'
const HASH_RE = /^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/

export const isValidId = (id: unknown): id is string => typeof id === 'string' && UUID_RE.test(id) && id !== NIL_UUID

const MAX_PATH_BYTES = 512
const MAX_URL_BYTES = 1024

/** `<project uuid>:<rest>` -> the two halves, or null. Cut at the FIRST colon: the rest may hold more. */
function splitProject(id: string): { project: string; rest: string } | null {
  const at = id.indexOf(':')
  if (at <= 0) return null
  const project = id.slice(0, at)
  return isValidId(project) ? { project, rest: id.slice(at + 1) } : null
}

function isRelativePath(path: string): boolean {
  if (path === '' || new TextEncoder().encode(path).length > MAX_PATH_BYTES) return false
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
  if (path.includes('\\') || /[\u0000-\u001f\u007f]/.test(path) || path.startsWith('/')) return false
  return path.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..')
}

function isHttpUrl(value: string): boolean {
  if (value === '' || new TextEncoder().encode(value).length > MAX_URL_BYTES || /\s/.test(value)) return false
  try {
    const u = new URL(value)
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.username === '' && u.password === '' && u.hostname !== ''
  } catch {
    return false
  }
}

export function validateRefId(format: IdFormat, id: unknown): id is string {
  if (typeof id !== 'string') return false
  switch (format) {
    case 'uuid':
      return isValidId(id)
    case 'project_commit': {
      const p = splitProject(id)
      return !!p && HASH_RE.test(p.rest)
    }
    case 'project_path': {
      const p = splitProject(id)
      return !!p && isRelativePath(p.rest)
    }
    case 'url':
      return isHttpUrl(id)
  }
}

/** Formats whose id is case-insensitive (hex): compared lower-cased. A path or an address is not. */
export const isCaseInsensitiveFormat = (format: IdFormat): boolean => format === 'uuid' || format === 'project_commit'

/** A token cannot carry whitespace: a path with a space can only come from the picker. */
export const fitsInToken = (id: string): boolean => !/\s/.test(id)
