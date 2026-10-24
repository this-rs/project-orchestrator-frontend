import { useCallback, useState, type FormEvent } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Link } from 'react-router-dom'
import { Send } from 'lucide-react'
import { activeWorkspaceSlugAtom, chatDraftInputAtom, chatPanelModeAtom } from '@/atoms'
import { focusRing, glassButton, iconButton, pressFeedback, surface } from '@/components/ui/classes'
import { ASK_TEXT, buildDayContext } from './text'

export interface AskBarProps {
  /** Active workspace slug (filter), or null for all workspaces. */
  lane: string | null
  /** Whether at least one workspace exists; without one there is nowhere to ask, so show the way to create one. */
  hasWorkspace: boolean
  /** Titles of the tasks planned for today (the day plan). */
  plannedTasks?: readonly string[]
  /** Text of the requests waiting for the user's answer. */
  waitingRequests?: readonly string[]
}

/**
 * The ask bar at the top of Today: ask anything about the day, with one-tap prompts.
 * It opens the chat panel and drops the text in the draft — the canonical
 * open-then-draft idiom (`refs/source/addToChat.ts`). A picked suggestion also carries
 * the day's context as text. The chat opens in the lane's workspace when one is
 * filtered, else in the last/active workspace the panel already resolves.
 */
export function AskBar({ lane, hasWorkspace, plannedTasks = [], waitingRequests = [] }: AskBarProps) {
  const [value, setValue] = useState('')
  const mode = useAtomValue(chatPanelModeAtom)
  const setMode = useSetAtom(chatPanelModeAtom)
  const setDraft = useSetAtom(chatDraftInputAtom)
  const setActiveWorkspace = useSetAtom(activeWorkspaceSlugAtom)

  const openChat = useCallback(
    (text: string) => {
      // A lane is a workspace filter: the chat follows it. Without one, the panel
      // already resolves the last visited (or first) workspace — leave it alone.
      if (lane) setActiveWorkspace(lane)
      if (mode === 'closed') setMode('open')
      setDraft(text)
    },
    [lane, mode, setActiveWorkspace, setMode, setDraft],
  )

  if (!hasWorkspace) {
    return (
      <div data-testid="askbar-create-workspace" className={`${surface} p-4`}>
        <Link to="/workspace-selector" className={`${glassButton.secondary} min-h-9 px-3 py-2 text-sm`}>
          {ASK_TEXT.createWorkspace}
        </Link>
      </div>
    )
  }

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const text = value.trim()
    if (!text) return
    openChat(text)
    setValue('')
  }

  const pick = (suggestion: string) => {
    const context = buildDayContext(plannedTasks, waitingRequests)
    openChat(context ? `${suggestion}\n\n${context}` : suggestion)
  }

  return (
    <form data-testid="askbar" onSubmit={submit} className={`${surface} flex flex-col gap-2.5 p-4`}>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={ASK_TEXT.placeholder}
          aria-label={ASK_TEXT.region}
          className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/60"
        />
        <button type="submit" aria-label={ASK_TEXT.send} className={iconButton('primary', 'size-9 md:size-8')}>
          <Send className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2" data-testid="askbar-suggestions">
        {ASK_TEXT.suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => pick(suggestion)}
            className={`min-h-9 rounded-full border border-white/[0.08] px-3 py-1.5 text-xs text-gray-300 hover:bg-white/[0.06] hover:text-gray-100 ${focusRing} ${pressFeedback}`}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </form>
  )
}
