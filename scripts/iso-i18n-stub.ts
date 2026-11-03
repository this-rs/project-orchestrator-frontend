/**
 * Remplaçant minimal de `@/i18n` pour le banc de galerie (scripts/iso-shots.mjs).
 *
 * POURQUOI : le vrai module (`src/i18n/store.ts`) charge les messages via
 * `import.meta.glob(...)`, une primitive Vite qu'esbuild ne transforme pas.
 * Le composant réel `IsoSceneViz` n'utilise de `@/i18n` que `useT()` (les
 * libellés du bloc de refus et des boutons du stage) ; la galerie n'a pas
 * besoin des chaînes localisées : la clé suffit.
 *
 * Ce fichier n'est importé QUE par le bundle esbuild du banc (alias `@/i18n`),
 * jamais par l'application (qui, elle, passe par Vite).
 */

export function useT() {
  return {
    t: (key: string, vars?: Record<string, unknown>) => {
      const tail = key.split('.').pop() ?? key
      const count = vars && typeof (vars as { count?: number }).count === 'number' ? (vars as { count: number }).count : undefined
      return count !== undefined ? `${count} ${tail}` : tail
    },
    requested: 'en' as const,
    setLocale: () => {},
  }
}
