import { createElement } from 'react'
import { typeColor, typeIcon } from './entityVisuals'

/** Lucide icon of an entity type, tinted with the type colour. */
export function EntityTypeIcon({
  type,
  size = 14,
  className,
}: {
  type: string
  size?: number
  className?: string
}) {
  return createElement(typeIcon(type), {
    size,
    className,
    color: typeColor(type),
    'aria-hidden': true,
  })
}
