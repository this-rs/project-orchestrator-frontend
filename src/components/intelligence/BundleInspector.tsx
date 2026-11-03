// BundleInspector — présentation du contenu réel d'un tronc (corridor).
// Libellés en dur en français : aucune clé i18n dédiée n'existe encore.

import type { Corridor } from './graph3d/linkRouting'
import { formatExactCount } from './graph3d/linkMagnitude'

/** Nombre maximal de relations réelles listées. */
export const MAX_LISTED_LINKS = 50

export interface BundleInspectorProps {
  /** Corridor inspecté ; null = rien à afficher. */
  corridor: Corridor | null
  onClose: () => void
}

const endpointId = (e: string | { id: string }): string => (typeof e === 'string' ? e : e.id)

/** Panneau de présentation, sans état ni appel réseau. */
export function BundleInspector({ corridor, onClose }: BundleInspectorProps) {
  if (!corridor) return null
  const shown = corridor.links.slice(0, MAX_LISTED_LINKS)
  const rest = corridor.links.length - shown.length
  const { magnitude } = corridor
  return (
    <aside aria-label="Inspecteur de tronc" className="rounded-md border p-3 text-sm">
      <header className="flex items-center justify-between gap-2">
        <h3 className="font-medium">
          {corridor.from} → {corridor.to}
        </h3>
        <button type="button" aria-label="Fermer" onClick={onClose}>
          ×
        </button>
      </header>
      <p data-testid="bundle-exact-count">{formatExactCount(magnitude.exactCount)} relations</p>
      <p>Ordre de grandeur : 10^{magnitude.magnitudeOrder}</p>
      <h4 className="mt-2 font-medium">Familles</h4>
      <ul>
        {corridor.families.map((f) => (
          <li key={f.relation}>
            {f.relation} : {formatExactCount(f.exactCount)} ({(f.share * 100).toFixed(1)} %)
          </li>
        ))}
      </ul>
      <h4 className="mt-2 font-medium">Relations réelles</h4>
      <ul>
        {shown.map((l, i) => (
          <li key={i} data-testid="bundle-link">
            {l.relationType} : {endpointId(l.source)} → {endpointId(l.target)}
          </li>
        ))}
      </ul>
      {rest > 0 && <p>+ {rest} autres</p>}
    </aside>
  )
}
