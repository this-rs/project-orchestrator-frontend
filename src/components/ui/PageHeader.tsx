import type { ReactNode } from 'react'
import type { OverflowMenuAction } from './OverflowMenu'
import { OverflowMenu } from './OverflowMenu'
import { CollapsibleMarkdown } from './CollapsibleMarkdown'

interface PageHeaderProps {
  title: string
  description?: string
  status?: ReactNode
  metadata?: { label: string; value: string | ReactNode }[]
  actions?: ReactNode
  overflowActions?: OverflowMenuAction[]
  children?: ReactNode
}

export function PageHeader({
  title,
  description,
  status,
  metadata,
  actions,
  overflowActions,
  children,
}: PageHeaderProps) {
  return (
    <div className="space-y-3">
      {/* Line 1: Title + Actions */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-gray-100 truncate">{title}</h1>
          {overflowActions && overflowActions.length > 0 && (
            <OverflowMenu actions={overflowActions} />
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>

      {/* Line 2: Status */}
      {status && <div>{status}</div>}

      {/* Line 3: Description */}
      {description && (
        <CollapsibleMarkdown content={description} maxHeight={120} />
      )}

      {/* Line 4: Metadata pills */}
      {metadata && metadata.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {metadata.map((item) => (
            <span
              key={item.label}
              className="inline-flex items-center gap-1.5 bg-white/[0.05] rounded-full px-3 py-1 text-xs text-gray-400"
            >
              <span className="text-gray-500">{item.label}</span>
              <span className="text-gray-300">{typeof item.value === 'string' ? item.value : item.value}</span>
            </span>
          ))}
        </div>
      )}

      {/* Line 5: Children (ex: linked project badge) */}
      {children}
    </div>
  )
}
