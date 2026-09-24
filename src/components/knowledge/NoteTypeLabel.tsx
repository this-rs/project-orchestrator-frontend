import { createElement } from 'react'
import { noteTypeMeta } from './noteMeta'

/** Note type as icon + text, e.g. `⚠ Gotcha`. The icon keeps its hue (icon size only). */
export function NoteTypeLabel({ type, className = '' }: { type: string; className?: string }) {
  const meta = noteTypeMeta(type)
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap ${className}`}>
      {createElement(meta.icon, { className: `w-3 h-3 shrink-0 ${meta.color}`, 'aria-hidden': true })}
      {meta.label}
    </span>
  )
}
