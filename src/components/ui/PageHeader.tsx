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
  /** view-transition-name for shared element morph (title ↔ card title) */
  viewTransitionName?: string
}

export function PageHeader({
  title,
  description,
  status,
  metadata,
  actions,
  overflowActions,
  children,
  viewTransitionName,
}: PageHeaderProps) {
  return (
    <div className="space-y-3">
      {/* Line 1: Title + Status + Overflow menu */}
      <div className="flex items-start justify-between gap-3">
        <h1
          className="text-xl md:text-2xl font-bold tracking-tight text-gray-100 truncate min-w-0"
          style={viewTransitionName ? { viewTransitionName } : undefined}
        >{title}</h1>
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          {status}
          {overflowActions && overflowActions.length > 0 && (
            <OverflowMenu actions={overflowActions} />
          )}
        </div>
      </div>

      {/* Line 2: Description */}
      {description && (
        <CollapsibleMarkdown content={description} maxHeight={120} />
      )}

      {/* Line 3: Children (left) + Metadata pills (right) */}
      {(children || (metadata && metadata.length > 0)) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">{children}</div>
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
        </div>
      )}
    </div>
  )
}
