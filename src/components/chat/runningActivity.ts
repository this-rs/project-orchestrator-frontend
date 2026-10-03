/**
 * What is running in this chat session, as ONE list.
 *
 * Before this module the answer was spread over the transcript (a workflow's
 * card inside its tool call, a sub-agent's group, an orphan background block)
 * and a pill in the composer toolbar that only knew Monitor and Bash. Each had
 * its own idea of "running". This is the single derivation the activity bar
 * above the composer renders — pure, so the rules are tested without a DOM.
 *
 * Sources, all already in the page (no request is made here):
 * - the backend's registry of background tasks (`active_tasks_update`) — the
 *   authority for Monitor / Bash-in-background: present means alive;
 * - `tool_use` blocks that collected background ticks (Workflow, background
 *   Task, …) — their status comes from `buildActivityFromToolCall`;
 * - a Task / Agent `tool_use` of the turn being streamed that has no result
 *   yet — a foreground sub-agent;
 * - orphan `background_activity` blocks (their tool call is outside the
 *   loaded window).
 */
import type { BackgroundTaskInfo, ChatMessage, ContentBlock } from '@/types'
import {
  agentProgress,
  buildActivityFromBlock,
  buildActivityFromToolCall,
  type ActivityModel,
} from '@/utils/backgroundActivity'

export type RunningKind = 'workflow' | 'agent' | 'shell' | 'monitor'

export interface RunningItem {
  /** Stable across renders: the tool call id, or the background task id. */
  id: string
  kind: RunningKind
  title: string
  /** ISO start, when known — drives the live elapsed time. */
  startedAt?: string
  /** Workflow fan-out: agents settled / total. */
  progress?: { settled: number; total: number }
  /** `data-tool-call-id` of the transcript block this came from, to scroll to it. */
  anchorId?: string
  /** Set when the backend can stop it on its own (`cancel-task`). */
  taskId?: string
}

export interface RunningInput {
  messages: ReadonlyArray<ChatMessage>
  backgroundTasks: ReadonlyArray<BackgroundTaskInfo>
  /** Is the session's current turn still streaming? */
  isStreaming: boolean
  /** Injected in tests; staleness is measured against it. */
  now?: number
}

/** Display order: the broadest unit of work first. */
export const KIND_ORDER: ReadonlyArray<RunningKind> = ['workflow', 'agent', 'shell', 'monitor']

const SUBAGENT_TOOL = /^(task|agent)$/i
const TITLE_MAX = 80

function firstLine(text: string): string {
  const line = text.split('\n')[0].trim()
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line
}

function toolCallId(block: ContentBlock): string {
  return (block.metadata?.tool_call_id as string | undefined) ?? block.id
}

function toolName(block: ContentBlock): string {
  return (block.metadata?.tool_name as string | undefined) ?? block.content
}

function isLive(activity: ActivityModel): boolean {
  return activity.status === 'running' || activity.status === 'queued'
}

/**
 * Only workflows and sub-agents are read from the transcript. A Monitor or a
 * Bash is listed from the backend registry alone: without it, the transcript
 * can only guess from how recent the last tick is, and would keep a finished
 * command "running" for minutes.
 */
function barKind(activity: ActivityModel): RunningKind | undefined {
  return activity.kind === 'workflow' || activity.kind === 'agent' ? activity.kind : undefined
}

/** Did this tool call hand its work to the background (its result is only a receipt)? */
function runsInBackground(block: ContentBlock, kind: RunningKind): boolean {
  const input = (block.metadata?.tool_input as Record<string, unknown> | undefined) ?? {}
  return kind === 'workflow' || input.run_in_background === true
}

function fromActivity(activity: ActivityModel, block: ContentBlock, anchorId: string): RunningItem | undefined {
  const kind = barKind(activity)
  if (!kind || !isLive(activity)) return undefined
  const progress = kind === 'workflow' && activity.agents.length > 0 ? agentProgress(activity.agents) : undefined
  return {
    id: activity.id,
    kind,
    title: firstLine(activity.title),
    startedAt: activity.startedAt ?? (block.metadata?.created_at as string | undefined),
    progress: progress && { settled: progress.settled, total: progress.total },
    anchorId,
  }
}

function subagentTitle(block: ContentBlock): string {
  const input = (block.metadata?.tool_input as Record<string, unknown> | undefined) ?? {}
  const text = [input.description, input.subagent_type, input.prompt].find(
    (v): v is string => typeof v === 'string' && v.trim() !== '',
  )
  return firstLine(text ?? 'Sub-agent')
}

export function collectRunning(input: RunningInput): RunningItem[] {
  const { messages, backgroundTasks, isStreaming, now } = input
  const activeIds = new Set(backgroundTasks.map((t) => t.id))
  const ctx = { activeIds, now }
  const items = new Map<string, RunningItem>()

  // The registry first: for a Monitor / Bash it is the truth, and the same id
  // met again in the transcript must not produce a second row.
  for (const task of backgroundTasks) {
    items.set(task.id, {
      id: task.id,
      kind: task.kind === 'monitor' ? 'monitor' : 'shell',
      title: firstLine(task.description) || (task.kind === 'monitor' ? 'Monitor' : 'Bash'),
      startedAt: task.started_at,
      anchorId: task.id,
      taskId: task.id,
    })
  }

  const results = new Map<string, ContentBlock>()
  for (const message of messages) {
    for (const block of message.blocks) {
      if (block.type === 'tool_result') results.set(toolCallId(block), block)
    }
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
  for (const message of messages) {
    for (const block of message.blocks) {
      if (block.type === 'background_activity') {
        const item = fromActivity(buildActivityFromBlock(block, ctx), block, block.id)
        if (item && !items.has(item.id)) items.set(item.id, item)
        continue
      }
      if (block.type !== 'tool_use') continue
      const id = toolCallId(block)
      if (items.has(id)) continue
      const result = results.get(id)
      const ticks = (block.metadata?.child_outputs as unknown[] | undefined) ?? []
      if (ticks.length > 0) {
        const item = fromActivity(buildActivityFromToolCall(block, result, ctx), block, id)
        // A foreground call that returned is over, whatever its last tick said.
        if (item && !(result && !runsInBackground(block, item.kind))) items.set(id, item)
        continue
      }
      // A foreground sub-agent says nothing until it returns. It is running
      // only while ITS turn streams: the same block in an old message, or
      // after an interrupted turn, is not.
      if (!result && isStreaming && message === lastAssistant && SUBAGENT_TOOL.test(toolName(block))) {
        items.set(id, {
          id,
          kind: 'agent',
          title: subagentTitle(block),
          startedAt: block.metadata?.created_at as string | undefined,
          anchorId: id,
        })
      }
    }
  }

  const rank = (item: RunningItem) => KIND_ORDER.indexOf(item.kind)
  return [...items.values()].sort(
    (a, b) => rank(a) - rank(b) || (a.startedAt ?? '').localeCompare(b.startedAt ?? ''),
  )
}

/** How many of each kind, in display order, kinds with none left out. */
export function countByKind(items: ReadonlyArray<RunningItem>): Array<{ kind: RunningKind; count: number }> {
  return KIND_ORDER.map((kind) => ({ kind, count: items.filter((i) => i.kind === kind).length })).filter(
    (entry) => entry.count > 0,
  )
}
