import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from './Button'
import { useT } from '@/i18n'

interface ErrorStateProps {
  title?: string
  description?: string
  onRetry?: () => void
  icon?: ReactNode
}

const DefaultIcon = () => (
  <AlertTriangle className="w-10 h-10 text-red-400" strokeWidth={1.5} />
)

/**
 * Full-width error state — replaces content area when a fetch fails.
 * Shows an icon, title, optional description, and optional retry button.
 */
export function ErrorState({
  title,
  description,
  onRetry,
  icon,
}: ErrorStateProps) {
  const { t } = useT()
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="mb-4">{icon ?? <DefaultIcon />}</div>
      <h3 className="text-lg font-semibold text-gray-200 mb-1">{title ?? t('ui.errorState.title')}</h3>
      {description && (
        <p className="text-sm text-gray-400 max-w-md mb-4">{description}</p>
      )}
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t('ui.errorState.retry')}
        </Button>
      )}
    </div>
  )
}
