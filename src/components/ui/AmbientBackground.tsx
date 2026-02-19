/**
 * AmbientBackground — Animated gradient mesh aurora.
 *
 * Renders 3 radial-gradient "light leak" orbs behind all content.
 * Each orb slowly drifts via CSS keyframes (GPU-composited translate only).
 * Colors are defined as CSS custom properties (--ambient-spot-*) for theming.
 *
 * - position: fixed, z-index: -1, pointer-events: none
 * - Respects prefers-reduced-motion (animation paused via CSS)
 * - No layout shift (CLS = 0) — element is out of normal flow
 */
export function AmbientBackground() {
  return (
    <div className="ambient-bg" aria-hidden="true">
      <div className="ambient-orb ambient-orb--1" />
      <div className="ambient-orb ambient-orb--2" />
      <div className="ambient-orb ambient-orb--3" />
    </div>
  )
}
