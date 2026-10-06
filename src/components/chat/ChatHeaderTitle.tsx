import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export interface ChatHeaderScope {
  /** `workspace` is the violet one, `project` the indigo one. */
  kind: 'workspace' | 'project'
  label: string
  to: string
}

const SCOPE_TONE: Record<ChatHeaderScope['kind'], string> = {
  workspace: 'border-purple-400/25 bg-purple-500/10 text-purple-300 hover:text-purple-200',
  project: 'border-indigo-400/25 bg-indigo-500/10 text-indigo-300 hover:text-indigo-200',
}

interface ChatHeaderTitleProps {
  title: string
  /** The workspace, else the project, the conversation belongs to. */
  scope?: ChatHeaderScope | null
  /** Provider and model of the conversation (a `ProviderBadge`). */
  badge?: ReactNode
}

/**
 * The conversation's title and what it belongs to, on ONE line.
 *
 * It used to be three stacked lines (title, project or workspace, provider and
 * model) in a header 56 px high: the text overflowed the bar and the
 * conversation lost its vertical room. Now the title is what gives way — it
 * truncates, with its full text as a tooltip — and the two chips keep their
 * size. Narrow widths drop the chips one after the other (the badge first, then
 * the scope): the composer's own control already says provider and model, and
 * the title says what the conversation is about.
 */
export function ChatHeaderTitle({ title, scope, badge }: ChatHeaderTitleProps) {
  return (
    <div className="flex min-w-0 items-center gap-2" data-testid="chat-header-title">
      <span className="min-w-0 truncate text-sm font-medium text-gray-300" title={title}>
        {title}
      </span>
      {scope && (
        <Link
          to={scope.to}
          onClick={(e) => e.stopPropagation()}
          data-testid="chat-header-scope"
          data-scope={scope.kind}
          title={scope.label}
          className={`hidden sm:inline-flex min-w-0 max-w-[10rem] shrink-0 items-center truncate rounded border px-1.5 py-px text-[10px] leading-4 transition-colors ${SCOPE_TONE[scope.kind]}`}
        >
          <span className="truncate">
            {scope.kind === 'workspace' ? '⬡ ' : ''}
            {scope.label}
          </span>
        </Link>
      )}
      {badge && <span className="hidden min-w-0 shrink-0 md:inline-flex">{badge}</span>}
    </div>
  )
}
