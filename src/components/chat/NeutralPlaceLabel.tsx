import { CircleDashed } from 'lucide-react'
import { useT } from '@/i18n'

/**
 * Shown INSTEAD of the working directory of a session that runs in the server's neutral folder
 * (plan « Chat sans dépendance au cwd », T1-bis): that path is an empty folder the server made,
 * never a project, so it is not displayed as one.
 */
export function NeutralPlaceLabel({ className = '' }: { className?: string }) {
  const { t } = useT()
  const hint = t('session.place.neutralHint')
  return (
    <span className={`inline-flex items-center gap-1 min-w-0 shrink ${className}`} title={hint} data-testid="neutral-place">
      <CircleDashed className="w-3 h-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{t('session.place.neutral')}</span>
      <span className="sr-only">: {hint}</span>
    </span>
  )
}
