import { useAtomValue } from 'jotai'
import { hoveredNodeIdAtom, intelligenceNodesAtom } from '@/atoms/intelligence'

const COARSE = '(pointer: coarse)'

function isCoarse(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(COARSE).matches
  } catch {
    return false
  }
}

function text(v: unknown): string | null {
  if (typeof v === 'string' && v.trim() !== '') return v
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return null
}

/**
 * Fixed card shown while a node is hovered: label, entity type (+ layer), community if known, position.
 * Fixed in the bottom-right corner (left of the controls), never follows the cursor, never takes a click.
 * Reads existing atoms only. Off on coarse pointers.
 */
export function GraphHoverCard() {
  const id = useAtomValue(hoveredNodeIdAtom)
  const nodes = useAtomValue(intelligenceNodesAtom)
  if (id == null || isCoarse()) return null
  const index = nodes.findIndex((n) => n.id === id)
  if (index < 0) return null
  const data = (nodes[index].data ?? {}) as Record<string, unknown>
  const label = text(data.label) ?? id
  const type = text(data.entityType)
  const layer = text(data.layer)
  const community = text(data.community_id)
  const kind = [type, layer].filter(Boolean).join(' · ')

  return (
    <div
      role="status"
      data-graph-hover-card=""
      className="pointer-events-none absolute bottom-3 right-14 z-40 flex max-w-[16rem] flex-col gap-0.5 rounded-lg border border-[var(--border-default)] bg-[var(--color-surface-raised)] px-2 py-1 text-[11px] text-[var(--text-tertiary)]"
    >
      <span className="truncate text-[12px] text-[var(--text-primary)]">{label}</span>
      {kind && <span className="truncate">{kind}</span>}
      {community && <span className="truncate font-mono tabular-nums text-[var(--text-secondary)]">c{community}</span>}
      <span className="font-mono tabular-nums text-[var(--text-secondary)]">
        {(index + 1).toLocaleString()} / {nodes.length.toLocaleString()}
      </span>
    </div>
  )
}
