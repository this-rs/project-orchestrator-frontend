import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import type { OverflowMenuAction } from './OverflowMenu'
import { OverflowMenu } from './OverflowMenu'
import { CollapsibleMarkdown } from './CollapsibleMarkdown'

export interface ParentLink {
  icon: LucideIcon
  label: string   // e.g. "Plan", "Project"
  name: string    // e.g. "Authentication Flow"
  href: string    // workspace-scoped path
}

interface PageHeaderProps {
  title: string
  description?: string
  status?: ReactNode
  metadata?: { label: string; value: string | ReactNode }[]
  actions?: ReactNode
  overflowActions?: OverflowMenuAction[]
  children?: ReactNode
  /** Clickable chips above the title linking to parent entities */
  parentLinks?: ParentLink[]
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
  parentLinks,
  viewTransitionName,
}: PageHeaderProps) {
  return (
    <div className="space-y-3">
      {/* Line 0: Parent navigation chips */}
      {parentLinks && parentLinks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {parentLinks.map((link) => {
            const Icon = link.icon
            return (
              <Link
                key={`${link.label}-${link.href}`}
                to={link.href}
                className="inline-flex items-center gap-1.5 bg-white/[0.06] border border-white/[0.08] rounded-full px-2.5 py-1 text-xs transition-colors hover:bg-white/[0.10] hover:border-white/[0.14]"
              >
                <Icon className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-gray-500">{link.label}</span>
                <span className="text-gray-300 truncate max-w-[180px]">{link.name}</span>
              </Link>
            )
          })}
        </div>
      )}

      {/* Line 1: Title + Status + Overflow menu */}
      <div className="flex items-start justify-between gap-3">
        <h1
          className="font-bold tracking-tight text-gray-100 truncate min-w-0"
          style={{ fontSize: 'var(--fluid-2xl)', ...(viewTransitionName ? { viewTransitionName } : undefined) }}
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
