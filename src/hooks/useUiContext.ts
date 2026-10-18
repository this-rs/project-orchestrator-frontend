import { useEffect } from 'react'
import { useSetAtom } from 'jotai'
import { uiContextAtom } from '@/atoms/anchors'

/**
 * A detail page says what it is about while it is mounted: « Demander ici »
 * suggests it as the anchor of a new conversation (a suggestion, never applied
 * without the person's Enter). Cleared on unmount, unless another page took over.
 */
export function useUiContext(kind: string, id: string | null | undefined, label?: string | null) {
  const set = useSetAtom(uiContextAtom)
  useEffect(() => {
    if (!id) return
    const ctx = { kind, id, ...(label ? { label } : {}) }
    set(ctx)
    return () => set((current) => (current && current.kind === kind && current.id === id ? null : current))
  }, [kind, id, label, set])
}
