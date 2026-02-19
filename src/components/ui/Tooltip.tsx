import { useRef, useEffect, useId, type ReactNode, type CSSProperties } from 'react'

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right'

interface TooltipProps {
  /** The content to display inside the tooltip */
  content: string
  /** Preferred position (flips automatically if not enough space) */
  position?: TooltipPosition
  /** The element that triggers the tooltip */
  children: ReactNode
  /** Delay before showing the tooltip (ms) */
  delay?: number
}

const positionAreaMap: Record<TooltipPosition, string> = {
  top: 'block-start',
  bottom: 'block-end',
  left: 'inline-start',
  right: 'inline-end',
}

/**
 * Tooltip component using Popover API (manual) + CSS Anchor Positioning.
 *
 * - Renders in the top layer (no z-index issues)
 * - Positioned via CSS anchor (no JS positioning)
 * - Flips automatically near viewport edges via position-try-fallbacks
 * - Accessible via aria-describedby
 * - Uses popover="manual" (upgrade to "hint" when Baseline)
 *
 * @example
 * <Tooltip content="Delete this item">
 *   <button>Delete</button>
 * </Tooltip>
 */
export function Tooltip({ content, position = 'top', children, delay = 400 }: TooltipProps) {
  const wrapperRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const reactId = useId()
  const uid = reactId.replace(/:/g, '')
  const anchorName = `--tt-${uid}`
  const tooltipId = `tt-${uid}`

  useEffect(() => {
    const wrapper = wrapperRef.current
    const tooltip = tooltipRef.current
    if (!wrapper || !tooltip) return

    const show = () => {
      timerRef.current = setTimeout(() => {
        try {
          tooltip.showPopover()
        } catch {
          /* already open */
        }
      }, delay)
    }

    const hide = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      try {
        tooltip.hidePopover()
      } catch {
        /* already closed */
      }
    }

    wrapper.addEventListener('mouseenter', show)
    wrapper.addEventListener('mouseleave', hide)
    wrapper.addEventListener('focusin', show)
    wrapper.addEventListener('focusout', hide)

    return () => {
      hide()
      wrapper.removeEventListener('mouseenter', show)
      wrapper.removeEventListener('mouseleave', hide)
      wrapper.removeEventListener('focusin', show)
      wrapper.removeEventListener('focusout', hide)
    }
  }, [delay])

  return (
    <>
      <span
        ref={wrapperRef}
        aria-describedby={tooltipId}
        style={{ anchorName, display: 'inline-flex' } as CSSProperties}
      >
        {children}
      </span>

      <div
        ref={tooltipRef}
        id={tooltipId}
        popover="manual"
        role="tooltip"
        className="popover-tooltip"
        style={
          {
            positionAnchor: anchorName,
            positionArea: positionAreaMap[position],
          } as CSSProperties
        }
      >
        {content}
      </div>
    </>
  )
}
