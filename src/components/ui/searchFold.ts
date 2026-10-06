/** Lower-cased, accents removed: what the searchable lists compare. */
export const fold = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
