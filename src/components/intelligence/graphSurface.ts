/**
 * The one recipe of the floating panels around the graph (controls, legend, inspector,
 * activation search, brightness, view switch). Plain strings, safe to concatenate.
 * Surfaces and text come from the PO tokens in `index.css`, never from Tailwind greys.
 */

/** A floating panel: one surface family, one radius (`rounded-xl`), one border. Add its own shadow. */
export const graphFloat =
  'rounded-xl border border-border-default bg-surface-popover/95 backdrop-blur-sm'

/** A group title inside a panel (level 2): 11px, medium, tertiary — never an uppercase kicker. */
export const graphGroupTitle = 'text-[11px] font-medium text-[var(--text-tertiary)]'

/** The label of a field inside a card (level 3): 10px, medium, secondary. */
export const graphFieldLabel = 'text-[10px] font-medium text-[var(--text-secondary)]'

/** The value of a field (level 4): 12px, readable, secondary. */
export const graphValue = 'text-xs leading-relaxed text-[var(--text-secondary)]'

/** A nested block inside a panel (a field card): same radius family as the panel, one step inward. */
export const graphField = 'rounded-lg border border-border-subtle bg-surface-overlay/60 p-2.5'

/** Focus and hover of a small graph control: a visible ring, a highlight on hover. */
export const graphControl =
  'transition-colors hover:bg-surface-highlight hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-light)]'
