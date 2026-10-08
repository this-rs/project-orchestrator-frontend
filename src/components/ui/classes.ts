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
/** Same role as `metaText` but 12 px / gray-400 (>= 4.5:1): for what the reader must be able to read on a phone (Today). */
export const metaTextReadable = 'text-xs leading-4 text-gray-400'
/** Where a thing comes from (contract information, not decoration): 12px, readable grey. */
export const provenanceText = 'text-xs leading-4 text-gray-400'

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
 * Press feedback for tappable controls: an immediate, tiny scale-down (120 ms)
 * that confirms the tap landed; hover colour changes take 200 ms on the single
 * curve. Tailwind v4 `scale-*` writes the `scale` property (not `transform`),
 * so `scale` is what must be transitioned.
 */
export const pressFeedback =
  'transition-[scale,background-color,color] duration-(--duration-fast) ease-(--ease-standard) active:duration-(--duration-instant) active:scale-[0.98] motion-reduce:active:scale-100'

/**
 * Glass buttons (CSS recipe: styles/buttons.css). The single source for `Button`
 * and every button-looking element. `variant` danger / primary / secondary / ghost;
 * `iconButton` makes them square; `glassFlat` removes the blur (dense rows: never
 * more than about ten blurred buttons on screen).
 */
const btnBase = 'btn font-semibold tracking-[-0.005em]'
export const glassButton = {
  primary: `${btnBase} btn-primary`,
  secondary: `${btnBase} btn-secondary`,
  danger: `${btnBase} btn-danger`,
  ghost: `${btnBase} btn-ghost`,
} as const
/** Square glass icon button (give it a size: `size-9 md:size-8`, `size-10`). */
export const iconButton = (variant: keyof typeof glassButton = 'ghost', size = 'size-10'): string => `${glassButton[variant]} btn-icon ${size}`
/** No backdrop blur: the translucent fill is enough (dense rows, lists). */
export const glassFlat = 'btn-flat'
/** Segmented control (view tabs, filters) and its items. */
export const segmented = 'seg'
export const segmentItem = 'seg-item'

/**
 * Display scale (from the site, `website/src/components/ui/classes.ts`; recipe in
 * `index.css` `.display-*`). The ONE sentence that names a dashboard — once per
 * screen, above the fold, never inside a list, row, card, dialog or detail section
 * (DESIGN.md § 2 « Display scale — where it stops »).
 */
/** Hero title (44→84px). Marketing only: no screen of the app has a hero. */
export const displayTitle = 'display-1'
/** Page-level display title (40→64px): Today's headline. */
export const pageTitle = 'display-2'
/** Section-level display title (32→48px): page-level empty states, the setup wizard, Login. */
export const sectionTitle = 'display-3'
/** Lead text under a display title: readable grey, bounded measure. */
export const leadText = 'text-base md:text-lg leading-relaxed text-gray-400 max-w-[var(--measure-md)]'
