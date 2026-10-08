import { useEffect } from 'react'

/**
 * Interactive halos: ONE passive `pointermove` listener on document, throttled by rAF, that writes CSS
 * variables (no React state, no re-render). `--mx/--my` (px) on the hovered target (`.btn`, `.halo`,
 * `.group/spot`) — the glass edge of a button follows the mouse through them (styles/buttons.css) —
 * and `--bgx/--bgy` (-1..1) on the root for background halos (inertia comes from the CSS transition).
 * Installed after mount; inactive without a fine pointer or under prefers-reduced-motion. Mounted ONCE,
 * in MainLayout. Copied from the site (website/src/components/ux/HaloPointer.tsx); the site re-syncs from here.
 */
const TARGET = '.btn, .halo, .group\\/spot'

export function HaloPointer() {
  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)')
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!fine.matches || calm.matches) return
    const root = document.documentElement
    let x = 0, y = 0, el: EventTarget | null = null, frame = 0
    const flush = () => {
      frame = 0
      root.style.setProperty('--bgx', ((x / window.innerWidth) * 2 - 1).toFixed(3))
      root.style.setProperty('--bgy', ((y / window.innerHeight) * 2 - 1).toFixed(3))
      const card = el instanceof Element ? el.closest<HTMLElement>(TARGET) : null
      if (card) {
        const r = card.getBoundingClientRect()
        card.style.setProperty('--mx', `${Math.round(x - r.left)}px`)
        card.style.setProperty('--my', `${Math.round(y - r.top)}px`)
      }
    }
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      x = e.clientX; y = e.clientY; el = e.target
      if (!frame) frame = requestAnimationFrame(flush)
    }
    document.addEventListener('pointermove', move, { passive: true })
    return () => { document.removeEventListener('pointermove', move); if (frame) cancelAnimationFrame(frame) }
  }, [])
  return null
}
