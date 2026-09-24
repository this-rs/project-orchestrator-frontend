import { useState } from 'react'
import { ChevronDown, Info } from 'lucide-react'
import { NEIGHBORHOOD_LAYERS } from '@/services/neighborhood'
import { LAYER_META, typeColor, typeLabel } from './entityVisuals'

export const AGENT_SENTENCE =
  "C'est ce voisinage que l'agent reçoit quand il travaille sur cette entité."

/**
 * Collapsible "how to read this graph" + colour legend of the types present.
 */
export function EntityGraphExplainer({
  typeCounts,
  defaultOpen = false,
}: {
  /** type → number of visible nodes of that type */
  typeCounts: [string, number][]
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="text-xs text-gray-400">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 h-8 px-2 -ml-2 rounded-md text-gray-300 hover:bg-white/[0.04]"
        >
          <Info size={13} className="text-indigo-300" />
          Comment lire ce graphe ?
          <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {/* Type legend — only the types actually on screen */}
        <ul aria-label="Légende des types" className="flex flex-wrap gap-x-3 gap-y-1">
          {typeCounts.map(([type, count]) => (
            <li key={type} className="inline-flex items-center gap-1">
              <span
                aria-hidden
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: typeColor(type) }}
              />
              {typeLabel(type)}
              <span className="tabular-nums text-gray-600">{count}</span>
            </li>
          ))}
        </ul>
      </div>

      {open && (
        <div className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-2 leading-relaxed">
          <p className="text-gray-200">{AGENT_SENTENCE}</p>
          <dl className="grid gap-x-3 gap-y-1.5 sm:grid-cols-[auto_1fr]">
            <dt className="font-medium text-gray-300">Anneaux</dt>
            <dd>
              La distance en sauts depuis cette entité : 1er anneau = liens directs, 2e = liens de
              liens, 3e = un cran plus loin. Sur un anneau, les nœuds sont regroupés par type puis
              classés du plus fort au plus faible.
            </dd>
            <dt className="font-medium text-gray-300">Taille, netteté</dt>
            <dd>
              La saillance : plus un nœud est gros et opaque, plus il compte pour cette entité.
              L’épaisseur d’un lien suit sa force.
            </dd>
            <dt className="font-medium text-gray-300">Relief</dt>
            <dd>
              Masque les liens faibles. Monte-le pour ne garder que l’essentiel, baisse-le pour tout
              voir.
            </dd>
            <dt className="font-medium text-gray-300">Couches</dt>
            <dd>
              <ul className="space-y-0.5">
                {NEIGHBORHOOD_LAYERS.map((l) => (
                  <li key={l}>
                    <span className="text-gray-300">{LAYER_META[l].label}</span> —{' '}
                    {LAYER_META[l].description}
                  </li>
                ))}
              </ul>
            </dd>
          </dl>
          <p className="text-gray-500">
            Touchez un nœud pour voir ce qu’il est et comment il est relié. Glissez pour déplacer,
            pincez pour zoomer.
          </p>
        </div>
      )}
    </div>
  )
}
