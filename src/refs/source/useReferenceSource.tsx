/**
 * Declaring an element as a reference source. See the procedure at the top of
 * `refSource.ts`.
 *
 *   const source = useReferenceSource({ kind: 'plan', id: plan.id, label: plan.title })
 *   <li {...source}>…</li>
 *
 * The props: `data-po-ref` (kind:id), `data-po-ref-label` (display only) and
 * `draggable`. They are inert without refs_v1 (the host attaches nothing and
 * the attribute is not rendered), so a server without the feature sees the
 * exact DOM it always had.
 *
 * The non-drag equivalent is `AddToChatButton` / `useAddToChatAction` (a menu
 * entry): same add path as a drop, reachable by keyboard, touch and Tauri
 * (whose main webview strips touch listeners: no long-press, a click instead).
 */
import type { MouseEvent } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { MessageSquarePlus } from 'lucide-react'
import { refsEnabledAtom } from '@/atoms/chat'
import type { OverflowMenuAction } from '@/components/ui/OverflowMenu'
import { fallbackName } from '../refState'
import type { EntityRef } from '../types'
import { addRefToChatAtom } from './addToChat'
import { ADD_TO_CHAT_SHORTCUT } from './ReferenceSourceHost'
import { REF_ATTR, REF_DRAG_ATTR, REF_LABEL_ATTR, parseEntityRef, serializeRefAttr } from './refSource'

export interface ReferenceSourceEntity {
  kind: string
  id: string
  /** What the user sees (title). Display only: never sent. */
  label?: string
}

export interface ReferenceSourceOptions {
  /** `false`: declared (button, shortcut) but not draggable — the element keeps its own drag (kanban). */
  drag?: boolean
}

type SourceProps = {
  'data-po-ref'?: string
  'data-po-ref-label'?: string
  'data-po-ref-drag'?: 'off'
  draggable?: true
}

const NONE: SourceProps = {}

export function useReferenceSource(entity: ReferenceSourceEntity | null | undefined, opts: ReferenceSourceOptions = {}): SourceProps {
  const enabled = useAtomValue(refsEnabledAtom)
  const ref = enabled && entity ? parseEntityRef(entity) : null
  if (!ref) return NONE
  const props: SourceProps = { [REF_ATTR]: serializeRefAttr(ref) } as SourceProps
  if (entity?.label) props[REF_LABEL_ATTR] = entity.label
  if (opts.drag === false) props[REF_DRAG_ATTR] = 'off'
  else props.draggable = true
  return props
}

/** The accessible name of the add action, shared by the button and the menu entry. */
const addLabel = (ref: EntityRef, label?: string) => `Add ${label?.trim() ? `“${label.trim()}”` : fallbackName(ref)} to chat`

/** "Add to chat" as an `OverflowMenuAction` (null when the feature is off or the entity invalid). */
export function useAddToChatAction(entity: ReferenceSourceEntity | null | undefined): OverflowMenuAction | null {
  const enabled = useAtomValue(refsEnabledAtom)
  const add = useSetAtom(addRefToChatAtom)
  const ref = enabled && entity ? parseEntityRef(entity) : null
  if (!ref || !entity) return null
  return { label: 'Add to chat', icon: MessageSquarePlus, onClick: () => void add({ ref, label: entity.label, via: 'button' }) }
}

interface AddToChatButtonProps {
  entity: ReferenceSourceEntity
  className?: string
}

/**
 * The visible non-drag equivalent: a real button (Tab, Enter, Space), >= 24px
 * (44px on a coarse pointer), named after the entity. Opens the chat if closed.
 */
export function AddToChatButton({ entity, className = '' }: AddToChatButtonProps) {
  const enabled = useAtomValue(refsEnabledAtom)
  const add = useSetAtom(addRefToChatAtom)
  const ref = enabled ? parseEntityRef(entity) : null
  if (!ref) return null
  const onClick = (e: MouseEvent) => {
    // Inside a stretched row link or a draggable carrier: the click is ours only.
    e.preventDefault()
    e.stopPropagation()
    add({ ref, label: entity.label, via: 'button' })
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={addLabel(ref, entity.label)}
      aria-keyshortcuts={ADD_TO_CHAT_SHORTCUT}
      title={`Add to chat (${ADD_TO_CHAT_SHORTCUT})`}
      className={`relative z-10 inline-flex size-8 min-h-6 min-w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 pointer-coarse:size-11 ${className}`}
    >
      <MessageSquarePlus className="size-4" aria-hidden="true" />
    </button>
  )
}
