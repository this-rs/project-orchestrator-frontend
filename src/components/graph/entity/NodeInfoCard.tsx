import { ArrowRight, ExternalLink, X } from 'lucide-react'
import type { NeighborhoodNode } from '@/services/neighborhood'
import type { PathStep } from './radialLayout'
import { EntityTypeIcon } from './EntityTypeIcon'
import { relLabel, typeLabel } from './entityVisuals'

export interface NodeInfoCardProps {
  node: NeighborhoodNode
  isCenter: boolean
  /** Path from the center to this node (null = not connected by a visible edge). */
  path: PathStep[] | null
  /** Label lookup for intermediate nodes of the path. */
  labelOf: (id: string) => string
  href: string | null
  onOpen?: (node: NeighborhoodNode) => void
  onClose: () => void
}

/**
 * Compact card for the selected node. Floating layer → glass surface
 * (translucent + backdrop blur, opaque fallback without backdrop-filter).
 * TODO(ui-kit): swap for the design-system glass popover class at integration.
 */
export function NodeInfoCard({
  node,
  isCenter,
  path,
  labelOf,
  href,
  onOpen,
  onClose,
}: NodeInfoCardProps) {
  const canOpen = !isCenter && (href !== null || onOpen !== undefined)
  const openLabel = 'Ouvrir'

  return (
    <div
      role="dialog"
      aria-label={`Détails : ${node.label}`}
      className="eg-card rounded-xl border border-white/10 bg-surface-popover supports-[backdrop-filter]:bg-surface-popover/70 supports-[backdrop-filter]:backdrop-blur-md shadow-xl p-3 text-xs text-gray-300"
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0">
          <EntityTypeIcon type={node.type} size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">
            {typeLabel(node.type)}
            {!isCenter && (
              <>
                {' · '}à {node.depth} saut{node.depth > 1 ? 's' : ''}
                {' · '}saillance {Math.round(node.weight * 100)}%
              </>
            )}
            {isCenter && ' · entité courante'}
          </div>
          <div className="text-sm font-medium text-gray-100 break-words">{node.label}</div>
          {node.subtitle && <div className="text-gray-400 break-words">{node.subtitle}</div>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="shrink-0 -mr-1 -mt-1 inline-flex items-center justify-center w-8 h-8 rounded-md text-gray-500 hover:text-gray-200 hover:bg-white/[0.06]"
        >
          <X size={14} />
        </button>
      </div>

      {!isCenter && (
        <div className="mt-2" aria-label="Relation au centre">
          {path && path.length > 0 ? (
            <ol className="flex flex-wrap items-center gap-1 text-[11px]">
              {path.map((s, i) => (
                <li key={`${s.from}-${s.to}-${i}`} className="inline-flex items-center gap-1">
                  {i > 0 && (
                    <span className="text-gray-500 truncate max-w-[8rem]">{labelOf(s.from)}</span>
                  )}
                  <span className="inline-flex items-center gap-0.5 rounded bg-indigo-500/15 text-indigo-200 px-1.5 py-0.5">
                    {relLabel(s.rel)}
                    <ArrowRight size={10} aria-hidden />
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <span className="text-gray-500">
              Relation indirecte (lien masqué par le relief ou les couches).
            </span>
          )}
        </div>
      )}

      {canOpen && (
        <div className="mt-3 flex justify-end">
          {href ? (
            <a
              href={href}
              onClick={(e) => {
                if (onOpen) {
                  e.preventDefault()
                  onOpen(node)
                }
              }}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-indigo-500/20 text-indigo-100 hover:bg-indigo-500/30 font-medium"
            >
              {openLabel}
              <ExternalLink size={12} aria-hidden />
            </a>
          ) : (
            <button
              type="button"
              onClick={() => onOpen?.(node)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-indigo-500/20 text-indigo-100 hover:bg-indigo-500/30 font-medium"
            >
              {openLabel}
              <ExternalLink size={12} aria-hidden />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
