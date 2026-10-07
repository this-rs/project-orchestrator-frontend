import { Link } from 'react-router-dom'

export interface ChatHeaderScope {
  /** `workspace` is the violet one, `project` the indigo one. */
  kind: 'workspace' | 'project'
  label: string
  to: string
}

/** Quiet colour, no box: the scope is a note under the title, not a second title. */
const SCOPE_TONE: Record<ChatHeaderScope['kind'], string> = {
  workspace: 'text-purple-400/80 hover:text-purple-300',
  project: 'text-indigo-400/80 hover:text-indigo-300',
}

interface ChatHeaderTitleProps {
  title: string
  /** The workspace, else the project, the conversation belongs to. */
  scope?: ChatHeaderScope | null
}

/**
 * The conversation's title, with what it belongs to in small type under it.
 *
 * The title comes FIRST and takes whatever width the header leaves: it truncates, with its full
 * text as a tooltip. The workspace or project is a second, 10 px line in the same bar (the bar keeps
 * its height) that truncates on its own. Provider and model are not shown here: the composer says
 * them, right where the conversation is written.
 *
 * Nothing here depends on the width of the WINDOW (`sm:`, `md:`). The panel can be docked narrow on
 * a wide screen, and a chip shown "because the window is wide" used to take the whole bar and push
 * the title under the buttons.
 */
export function ChatHeaderTitle({ title, scope }: ChatHeaderTitleProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center" data-testid="chat-header-title">
      <span className="truncate text-sm font-medium leading-5 text-gray-300" title={title}>
        {title}
      </span>
      {scope && (
        <Link
          to={scope.to}
          onClick={(e) => e.stopPropagation()}
          data-testid="chat-header-scope"
          data-scope={scope.kind}
          title={scope.label}
          className={`truncate text-[10px] leading-3 transition-colors ${SCOPE_TONE[scope.kind]}`}
        >
          {scope.kind === 'workspace' ? '⬡ ' : ''}
          {scope.label}
        </Link>
      )}
    </div>
  )
}
