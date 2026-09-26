import { useState } from 'react'
import { ChevronDown, Info } from 'lucide-react'
import { NEIGHBORHOOD_LAYERS } from '@/services/neighborhood'
import { LAYER_META, typeColor, typeLabel } from './entityVisuals'

export const AGENT_SENTENCE =
  'This neighborhood is what the agent receives when it works on this entity.'

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
          How to read this graph?
          <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {/* Type legend — only the types actually on screen */}
        <ul aria-label="Type legend" className="flex flex-wrap gap-x-3 gap-y-1">
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
            <dt className="font-medium text-gray-300">Rings</dt>
            <dd>
              The distance in hops from this entity: 1st ring = direct links, 2nd = links of links,
              3rd = one step further. On a ring, nodes are grouped by type then sorted from strongest
              to weakest.
            </dd>
            <dt className="font-medium text-gray-300">Size, sharpness</dt>
            <dd>
              Salience: the bigger and more opaque a node, the more it matters to this entity. The
              thickness of a link follows its strength.
            </dd>
            <dt className="font-medium text-gray-300">Relief</dt>
            <dd>
              Hides weak links. Raise it to keep only the essentials, lower it to see everything.
            </dd>
            <dt className="font-medium text-gray-300">Layers</dt>
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
            Tap a node to see what it is and how it is linked. Drag to pan, pinch to zoom.
          </p>
        </div>
      )}
    </div>
  )
}
