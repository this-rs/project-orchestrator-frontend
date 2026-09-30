/**
 * Shared Tailwind class strings — use these instead of re-typing the recipe
 * in every page (see DESIGN.md). Plain strings, safe to concatenate.
 */

/** Focus ring for custom interactive elements (buttons / links without <Button>). */
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/60'

/** Inset variant for full-width rows (ring drawn inside the element). */
export const focusRingInset =
  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-indigo-500/60'

/**
 * Enlarges the tap target of a small inline control (≈ +10px vertically,
 * +4px horizontally) WITHOUT changing layout. The element must not clip
 * overflow. Use on small text buttons / links inside meta lines.
 */
export const hitArea = "relative after:absolute after:content-[''] after:-inset-x-1 after:-inset-y-2.5"

/**
 * Put this on any interactive element placed inside an EntityRow (links in
 * the meta line, inline buttons…) so it sits above the row's stretched link.
 */
export const rowInteractive = 'relative z-10'

/** Muted secondary text, 11px — rows, counts, captions. */
export const metaText = 'text-[11px] leading-4 text-gray-500'

/** Small muted text link (e.g. "Clear", "more"). */
export const textLink =
  'rounded text-indigo-400/90 hover:text-indigo-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/60'

/** Inline entity link in a meta line (plan / project / task names). */
export const inlineLink =
  'rounded text-gray-400 hover:text-gray-200 hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/60'

/** Standard surface for a list / section container. */
export const surface = 'rounded-xl border border-white/[0.06] bg-white/[0.02]'

/**
 * Glass material for FLOATING layers only (menus, popovers, sheets, sticky
 * bars, toasts). Opaque fallback without backdrop-filter support and under
 * `prefers-reduced-transparency`. Never on content — see DESIGN.md.
 */
export const glass = 'ui-glass'

/** Entrance of a floating layer (menu, popover): short rise + fade. */
export const popIn = 'ui-pop-in'

/**
 * Press feedback for tappable controls: an immediate, tiny scale-down that
 * confirms the tap landed. Feedback motion — never longer than ~120ms.
 * Tailwind v4 `scale-*` writes the `scale` property (not `transform`), so
 * `scale` is what must be transitioned.
 */
export const pressFeedback =
  'transition-[scale,background-color,color] duration-[120ms] ease-out active:scale-[0.97] motion-reduce:active:scale-100'

