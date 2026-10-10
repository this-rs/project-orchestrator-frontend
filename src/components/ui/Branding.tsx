/**
 * Unified "Made by Freedom From Scratch" branding component.
 *
 * Variants:
 * - "inline"  : single-line, small (9px) — for graph overlays & compact footers
 * - "stacked" : two-line, slightly larger — for page footers, login, 404
 */
import { useT } from '@/i18n'

interface BrandingProps {
  variant?: 'inline' | 'stacked'
  className?: string
}

export function Branding({ variant = 'stacked', className = '' }: BrandingProps) {
  const { t } = useT()
  if (variant === 'inline') {
    return (
      <span
        className={`text-[9px] text-slate-600 tracking-wide pointer-events-none select-none ${className}`}
      >
        {t('ui.branding.madeByInline')}
      </span>
    )
  }

  return (
    <div className={`text-center text-xs tracking-wide select-none ${className}`}>
      <div className="text-slate-600">{t('ui.branding.madeBy')}</div>
      <div className="text-slate-500">Freedom From Scratch</div>
    </div>
  )
}
