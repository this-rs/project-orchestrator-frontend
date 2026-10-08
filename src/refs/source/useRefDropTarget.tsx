import { useCallback, useRef, useState, type DragEvent } from 'react'
import { useAtomValue, useSetAtom, useStore } from 'jotai'
import { PlusCircle } from 'lucide-react'
import { refsEnabledAtom } from '@/atoms/chat'
import { fallbackName } from '../refState'
import { addRefToChatAtom, draggingRefAtom } from './addToChat'
import { dragCarriesRef, parseEntityRef, readRefFromDataTransfer } from './refSource'

/**
 * Drop handlers for a reference dropped on a surface (the composer, the whole
 * chat panel). A drag that is not ours (files, selected text) is not touched:
 * the handlers return before any `preventDefault`.
 *
 * `stop`: the composer stops what it handled so the panel zone around it does
 * not handle the same drop twice (and does not draw its own overlay on top).
 */
export function useRefDropTarget({ stop = false }: { stop?: boolean } = {}) {
  const enabled = useAtomValue(refsEnabledAtom)
  const store = useStore()
  const add = useSetAtom(addRefToChatAtom)
  const dragged = useAtomValue(draggingRefAtom)
  const depth = useRef(0)
  const [over, setOver] = useState(false)

  const accepts = useCallback(
    (e: DragEvent) => enabled && dragCarriesRef(e.dataTransfer, store.get(draggingRefAtom)),
    [enabled, store],
  )

  const onDragEnter = useCallback(
    (e: DragEvent) => {
      if (!accepts(e)) return
      if (stop) e.stopPropagation()
      depth.current++
      setOver(true)
    },
    [accepts, stop],
  )
  const onDragOver = useCallback(
    (e: DragEvent) => {
      if (!accepts(e)) return
      // Without preventDefault the drop never fires (and a textarea would insert the raw text).
      e.preventDefault()
      if (stop) e.stopPropagation()
      e.dataTransfer.dropEffect = 'copy'
    },
    [accepts, stop],
  )
  const onDragLeave = useCallback(
    (e: DragEvent) => {
      if (!accepts(e)) return
      if (stop) e.stopPropagation()
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setOver(false)
    },
    [accepts, stop],
  )
  const onDrop = useCallback(
    (e: DragEvent) => {
      if (!accepts(e)) return
      e.preventDefault()
      if (stop) e.stopPropagation()
      depth.current = 0
      setOver(false)
      const inFlight = store.get(draggingRefAtom)
      const ref = parseEntityRef(readRefFromDataTransfer(e.dataTransfer) ?? inFlight)
      store.set(draggingRefAtom, null)
      // It said it was a reference and was not one: say so rather than swallow the drop.
      if (!ref) {
        add({ ref: null, via: 'drop' })
        return
      }
      const label = inFlight && inFlight.kind === ref.kind && inFlight.id.toLowerCase() === ref.id.toLowerCase() ? inFlight.label : undefined
      add({ ref, label, via: 'drop' })
    },
    [accepts, stop, store, add],
  )

  return {
    zoneProps: { onDragEnter, onDragOver, onDragLeave, onDrop },
    /** The pointer is over this zone with one of our references. */
    over: enabled && over && dragged !== null,
  }
}

/** The hover feedback: a dashed frame, an icon and words — never colour alone. */
export function RefDropOverlay({ label, className = '' }: { label?: string; className?: string }) {
  const dragged = useAtomValue(draggingRefAtom)
  const name = dragged ? (dragged.label ?? fallbackName(dragged)) : label
  return (
    <div
      role="status"
      data-testid="ref-drop-overlay"
      className={`pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-lg border-2 border-dashed border-indigo-400 bg-[#14161a]/90 ${className}`}
    >
      <span className="flex items-center gap-1.5 px-3 text-center text-xs text-slate-200">
        <PlusCircle className="size-3.5 shrink-0" aria-hidden="true" />
        {name ? `Drop to add “${name}” to the message` : 'Drop to add to the message'}
      </span>
    </div>
  )
}
