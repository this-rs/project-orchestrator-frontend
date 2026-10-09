/**
 * slug -> id for the entities whose page is keyed by a slug (a project, a
 * workspace). Fed by the API layer from the lists it already fetches, so any
 * link to such a page becomes a reference with no code in the screen.
 * Not loaded yet = no answer = not a reference (never a guess).
 */
const known = new Map<string, Map<string, string>>()

export function rememberSlugs(kind: string, items: readonly { slug?: unknown; id?: unknown }[] | null | undefined): void {
  if (!Array.isArray(items)) return
  let bucket = known.get(kind)
  for (const it of items) {
    if (!it || typeof it.slug !== 'string' || typeof it.id !== 'string') continue
    if (!bucket) known.set(kind, (bucket = new Map()))
    bucket.set(it.slug, it.id)
  }
}

export const lookupSlug = (kind: string, slug: string): string | null => known.get(kind)?.get(slug) ?? null

export const clearSlugRegistry = (): void => known.clear()
