/**
 * One geometry for the composer's chips — the permission mode and the
 * provider/model chip sit side by side and must be the same height.
 *
 * The visible chip is 20px (`h-5`, `leading-none`: the height never depends on
 * the font's line height). The target is larger than what is drawn: a
 * transparent `::before` stretches it to 24px (WCAG 2.2, 2.5.8) and, on touch,
 * to 32px — the height of the controls row, so it never reaches into the
 * textarea above it.
 */
export const COMPOSER_CHIP_HEIGHT = 'h-5'

export const COMPOSER_CHIP_HIT =
  "before:absolute before:inset-x-0 before:-inset-y-0.5 before:content-[''] pointer-coarse:before:-inset-y-1.5"

export const COMPOSER_CHIP = `relative inline-flex ${COMPOSER_CHIP_HEIGHT} min-w-0 max-w-full items-center gap-1 rounded border bg-white/[0.04] px-1.5 text-[10px] leading-none text-gray-300 transition-colors hover:bg-white/[0.06] outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${COMPOSER_CHIP_HIT}`

/**
 * A reference chip inside a line of text (the agent's prose, the user's
 * bubble), and in the composer's reference list.
 *
 * Visible: 20px (`leading-4` + 1px padding + 1px border, each side). The
 * negative vertical margin takes 2px off each side of the box the line
 * counts, so the chip adds 16px to its line — less than any line it sits in
 * (20px in the bubble, 24px in the prose): a chip never pushes lines apart.
 */
export const REF_CHIP_HEIGHT = 'py-px leading-4 -my-0.5'

/** The link target: 24px however small the chip is drawn (WCAG 2.2, 2.5.8). */
export const REF_CHIP_HIT = "before:absolute before:inset-x-0 before:-inset-y-0.5 before:content-['']"
