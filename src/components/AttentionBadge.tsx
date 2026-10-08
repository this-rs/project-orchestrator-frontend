import { useAttentionCount } from '@/hooks/useAttentionCount'
import { useT } from '@/i18n'

/** "3 requests waiting for you" (the full text read by screen readers; the noun is translated, `nav.attention.*`). */
export function attentionLabel(count: number, noun: { one: string; many: string }): string {
  return `${count} ${count > 1 ? noun.many : noun.one}`
}

/** 0 and unknown show nothing; above 99 it reads "99+". */
export function attentionText(count: number): string {
  return count > 99 ? '99+' : String(count)
}

/**
 * Pending-request count on a Today entry. Renders nothing at 0 or when the
 * source failed. `corner` pins it over the icon corner (collapsed sidebar,
 * hamburger): absolutely positioned, so its arrival never shifts the layout;
 * `inline` sits at the end of a row, whose text is unaffected.
 */
export function AttentionBadge({ variant = 'inline' }: { variant?: 'inline' | 'corner' }) {
  const count = useAttentionCount()
  const { t } = useT()
  if (!count || count < 0) return null
  const pos = variant === 'corner' ? 'absolute -right-1 -top-1' : 'ml-auto shrink-0'
  return (
    <span
      role="status"
      aria-label={attentionLabel(count, { one: t('nav.attention.one'), many: t('nav.attention.many') })}
      data-testid="attention-badge"
      className={`${pos} inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-500 px-1 text-[10px] font-medium leading-none tabular-nums text-white`}
    >
      {attentionText(count)}
    </span>
  )
}
