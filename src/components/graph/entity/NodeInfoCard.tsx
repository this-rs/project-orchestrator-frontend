import { ArrowRight, ExternalLink, X } from 'lucide-react'
import { Button } from '@/components/ui'
import { glass, glassButton, glassFlat, iconButton, popIn } from '@/components/ui/classes'
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
 * Compact card for the selected node. Floating layer → the design system's glass
 * (`ui-glass`: translucent + blur, opaque fallback without backdrop-filter).
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
  const openLabel = 'Open'

  return (
    <div
      role="dialog"
      aria-label={`Details: ${node.label}`}
      className={`eg-card rounded-xl p-3 text-xs text-gray-300 ${glass} ${popIn}`}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0">
          <EntityTypeIcon type={node.type} size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] leading-4 text-gray-500">
            {typeLabel(node.type)}
            {!isCenter && (
              <>
                {' · '}{node.depth} hop{node.depth > 1 ? 's' : ''} away
                {' · '}salience {Math.round(node.weight * 100)}%
              </>
            )}
            {isCenter && ' · current entity'}
          </div>
          <div className="text-sm font-medium text-gray-100 break-words">{node.label}</div>
          {node.subtitle && <div className="text-gray-400 break-words">{node.subtitle}</div>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className={`${iconButton('ghost', 'size-9 md:size-8')} ${glassFlat} shrink-0 -mr-1 -mt-1`}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      {!isCenter && (
        <div className="mt-2" aria-label="Relation to the center">
          {path && path.length > 0 ? (
            <ol className="flex flex-wrap items-center gap-1 text-[11px]">
              {path.map((s, i) => (
                <li key={`${s.from}-${s.to}-${i}`} className="inline-flex items-center gap-1">
                  {i > 0 && (
                    <span className="text-gray-500 truncate max-w-[8rem]">{labelOf(s.from)}</span>
                  )}
                  <span className="inline-flex items-center gap-0.5 rounded border border-white/[0.08] px-1.5 py-0.5 text-[11px] text-gray-300">
                    {relLabel(s.rel)}
                    <ArrowRight size={10} aria-hidden />
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <span className="text-gray-500">
              Indirect relation (link hidden by the relief or the layers).
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
              className={`${glassButton.primary} min-h-9 px-3 py-2 text-sm`}
            >
              {openLabel}
              <ExternalLink size={12} aria-hidden />
            </a>
          ) : (
            <Button type="button" size="sm" onClick={() => onOpen?.(node)}>
              {openLabel}
              <ExternalLink size={12} aria-hidden />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
