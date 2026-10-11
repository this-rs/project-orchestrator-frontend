/**
 * AgentToolRenderer — the `Agent` tool of the native harness (P18): a task
 * handed to a sub-agent that runs in a CHILD CONVERSATION of this session.
 *
 * Why a renderer of its own: the generic card showed the call's JSON and left
 * the child conversation unreachable — the user had to hunt for it in the
 * session list. Here the card says what the sub-agent was asked and links to
 * the conversation it ran in.
 *
 * How the child is found: the backend opens it with
 * `spawned_by = conversation { parent_session_id, tool_use_id }`, and
 * `tool_use_id` IS this call's id. That is the only join available — the native
 * harness declares `subagents: none` and never emits `parent_tool_use_id`, so
 * the Claude Code nesting path (`groupBlocksByAgent` / `AgentGroup`) cannot
 * apply. The children come from the children endpoint through
 * `useDetachedRuns` → `ChatSessionProvider`.
 *
 * Degrades on purpose: with no child resolved (older backend, child not listed
 * yet) the card never offers a dead link. Whether it SAYS a child is coming
 * depends on who hosts sub-agents — see below.
 *
 * Claude Code's own sub-agent tool is ALSO named `Agent` (older CLIs: `Task`),
 * with the same `prompt` / `subagent_type` input, so a Claude Code call that
 * is not nested into an `AgentGroup` (background agent, nested call, history
 * without `parent_tool_use_id`) lands on this card too. Claude Code runs its
 * sub-agents in-process: PO never opens a child conversation for them. So the
 * "not listed yet" promise is made only when PO is the one hosting sub-agents —
 * the provider declares `subagents: 'none'` (the native harness). Elsewhere the
 * card is a plain sub-agent card: task, kind, answer. A child that DOES answer
 * to this call's id is linked whatever the capabilities say — only a PO-hosted
 * child carries a `tool_use_id`, and a transcript outside the chat panel (the
 * full-page viewer) has no capabilities of its own to ask.
 *
 * A call the backend refused (error result, no child) shows the failure, not a
 * wait for a child that will never be opened.
 */

import { ArrowUpRight, Loader2 } from 'lucide-react'
import { useT } from '@/i18n'
import { useChatCapabilities, useChildSessionOf } from '../ChatSessionContext'
import type { ToolRendererProps } from './types'

const MAX_RESULT_CHARS = 2000

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function AgentToolRenderer({ toolInput, resultContent, isError, isLoading, toolCallId }: ToolRendererProps) {
  const { t } = useT()
  const { child, openSession } = useChildSessionOf(toolCallId)
  // PO opens the child only for a provider with no sub-agents of its own.
  const poHostsChild = useChatCapabilities().subagents === 'none'
  const prompt = text(toolInput.prompt)
  const subagentType = text(toolInput.subagent_type)
  const answer = resultContent ?? ''

  return (
    <div className="space-y-2" data-testid="agent-tool-card">
      {subagentType && (
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-medium text-gray-500">{t('chatA-tools.agent.kind')}</span>
          <span className="text-xs font-mono text-violet-300">{subagentType}</span>
        </div>
      )}

      {prompt && (
        <div>
          <div className="text-[11px] font-medium text-gray-500 mb-1">{t('chatA-tools.agent.asked')}</div>
          <pre className="text-xs text-gray-400 bg-black/20 rounded p-2 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
            {prompt}
          </pre>
        </div>
      )}

      {/* The child conversation. A resolved child is a link; a missing one is said, where PO would open it. */}
      {child && openSession ? (
        <button
          type="button"
          onClick={() => openSession(child.sessionId)}
          title={t('chatA-tools.agent.openTitle')}
          data-testid="agent-open-child"
          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors"
        >
          {child.isStreaming ? (
            <Loader2 className="w-3 h-3 shrink-0 animate-spin" aria-hidden />
          ) : (
            <ArrowUpRight className="w-3 h-3 shrink-0" aria-hidden />
          )}
          <span>{t('chatA-tools.agent.open')}</span>
          <span className="text-gray-500 truncate max-w-[16rem]">{child.title}</span>
        </button>
      ) : poHostsChild && !isError ? (
        <p className="text-xs text-gray-600 italic" title={t('chatA-tools.agent.noChildTitle')} data-testid="agent-no-child">
          {t('chatA-tools.agent.noChild')}
        </p>
      ) : null}

      {/* While it runs there is no result yet; once answered, the tool result IS the answer. */}
      {isLoading ? (
        <p className="text-xs text-amber-300" role="status">{t('chatA-tools.agent.running')}</p>
      ) : answer !== '' ? (
        <div>
          <div className={`text-[11px] font-medium mb-1 ${isError ? 'text-red-400' : 'text-gray-500'}`}>
            {isError ? t('chatA-tools.agent.failed') : t('chatA-tools.agent.answer')}
          </div>
          <pre
            className={`text-xs rounded p-2 whitespace-pre-wrap break-words max-h-60 overflow-y-auto ${
              isError ? 'text-red-400 bg-red-900/10' : 'text-gray-400 bg-black/20'
            }`}
          >
            {answer.length > MAX_RESULT_CHARS
              ? `${answer.slice(0, MAX_RESULT_CHARS)}\n${t('chatA-tools.default.truncated')}`
              : answer}
          </pre>
        </div>
      ) : null}
    </div>
  )
}
