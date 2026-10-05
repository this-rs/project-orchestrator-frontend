import { useState, useEffect, useRef } from 'react'
import type { ContentBlock } from '@/types'
import { supportsScope, type ToolCategory } from '@/types/provider'
import { POLICY_ONLY_REQUEST_TEXT } from '@/constants/capabilities'
import { useChatCapabilities } from './ChatSessionContext'
import { useBlockProviderKind } from './useBlockProviderKind'
import { commandText, getToolCategory } from './tools'
import { Terminal, Eye, FileEdit, Zap, Globe, AlertTriangle, Check, X, ChevronRight } from 'lucide-react'

// ---------------------------------------------------------------------------
// Tool category classification + colors
// ---------------------------------------------------------------------------

// Which category a tool belongs to is decided by the registry
// (`getToolCategory`): the provider adapter's `category` when the event carries
// one, the Claude tool table otherwise. No tool name is known here.

type CategoryStyle = {
  border: string
  bg: string
  text: string
  icon: string
  label: string
}

const READ_STYLE: CategoryStyle = {
  border: 'border-l-emerald-500/40',
  bg: 'bg-emerald-950/20',
  text: 'text-emerald-400',
  icon: 'text-emerald-400',
  label: 'Read',
}

const OTHER_STYLE: CategoryStyle = {
  border: 'border-l-gray-500/40',
  bg: 'bg-gray-950/20',
  text: 'text-gray-400',
  icon: 'text-gray-400',
  label: 'Tool',
}

const CATEGORY_STYLES: Record<ToolCategory, CategoryStyle> = {
  command: {
    border: 'border-l-amber-500/40',
    bg: 'bg-amber-950/20',
    text: 'text-amber-400',
    icon: 'text-amber-400',
    label: 'Command',
  },
  read: READ_STYLE,
  // Searching is reading: Glob and Grep have always been shown as "Read".
  search: READ_STYLE,
  edit: {
    border: 'border-l-blue-500/40',
    bg: 'bg-blue-950/20',
    text: 'text-blue-400',
    icon: 'text-blue-400',
    label: 'Edit',
  },
  mcp: {
    border: 'border-l-purple-500/40',
    bg: 'bg-purple-950/20',
    text: 'text-purple-400',
    icon: 'text-purple-400',
    label: 'MCP',
  },
  web: {
    border: 'border-l-cyan-500/40',
    bg: 'bg-cyan-950/20',
    text: 'text-cyan-400',
    icon: 'text-cyan-400',
    label: 'Web',
  },
  // No dedicated style for sub-agents yet: shown like any other tool.
  agent: OTHER_STYLE,
  other: OTHER_STYLE,
}

// ---------------------------------------------------------------------------
// Tool input formatter
// ---------------------------------------------------------------------------

function formatToolSummary(
  toolName: string,
  input: Record<string, unknown> | undefined,
  category: ToolCategory,
): { summary: string; detail: string | null; language: string } {
  if (!input || Object.keys(input).length === 0) {
    return { summary: toolName, detail: null, language: 'text' }
  }

  switch (category) {
    case 'command': {
      // A string for Claude's Bash, an argv array for Codex's `shell`.
      const command = commandText(input) || ''
      const desc = (input.description as string) || ''
      return { summary: desc || command.slice(0, 80) || 'Execute command', detail: command, language: 'bash' }
    }
    case 'read':
    case 'search': {
      const filePath =
        (input.file_path as string) || (input.path as string) || (input.pattern as string) || ''
      return {
        summary: filePath ? filePath.split('/').pop()! : toolName,
        detail: filePath,
        language: 'text',
      }
    }
    case 'edit': {
      const filePath = (input.file_path as string) || ''
      return {
        summary: filePath ? filePath.split('/').pop()! : toolName,
        detail: filePath,
        language: 'text',
      }
    }
    case 'mcp': {
      const parts = toolName.split('__')
      const shortName = parts[parts.length - 1] || toolName
      return {
        summary: shortName.replace(/_/g, ' '),
        detail: JSON.stringify(input, null, 2),
        language: 'json',
      }
    }
    case 'web': {
      const url = (input.url as string) || ''
      try {
        return { summary: url ? new URL(url).hostname : toolName, detail: url, language: 'text' }
      } catch {
        return { summary: toolName, detail: url, language: 'text' }
      }
    }
    default:
      return { summary: toolName, detail: JSON.stringify(input, null, 2), language: 'json' }
  }
}

// ---------------------------------------------------------------------------
// Category icons (compact)
// ---------------------------------------------------------------------------

function CategoryIcon({ category, className }: { category: ToolCategory; className?: string }) {
  const cls = className || 'w-3.5 h-3.5'
  switch (category) {
    case 'command':
      return <Terminal className={cls} />
    case 'read':
    case 'search':
      return <Eye className={cls} />
    case 'edit':
      return <FileEdit className={cls} />
    case 'mcp':
      return <Zap className={cls} />
    case 'web':
      return <Globe className={cls} />
    default:
      return <AlertTriangle className={cls} />
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface PermissionRequestBlockProps {
  block: ContentBlock
  onRespond: (toolCallId: string, allowed: boolean, remember?: { toolName: string }) => boolean | void
  disabled?: boolean
}

export function PermissionRequestBlock({
  block,
  onRespond,
  disabled,
}: PermissionRequestBlockProps) {
  const toolCallId = block.metadata?.tool_call_id as string
  const toolName = (block.metadata?.tool_name as string) || ''
  const toolInput = block.metadata?.tool_input as Record<string, unknown> | undefined

  // Decision can come from: auto_approved (live), decided (persisted/broadcast)
  const autoApproved = !!(block.metadata?.auto_approved)
  const persistedDecision = block.metadata?.decided
    ? (block.metadata.decision as 'allowed' | 'denied')
    : null

  // What the provider of this conversation can do: ask at all, and remember an answer.
  const caps = useChatCapabilities()
  const canRemember = supportsScope(caps, 'session')
  const providerKind = useBlockProviderKind()

  const category = getToolCategory(toolName, {
    providerKind,
    category: block.metadata?.tool_category,
    canonical: block.metadata?.tool_canonical as string | undefined,
  })
  const styles = CATEGORY_STYLES[category]
  const { summary, detail, language } = formatToolSummary(toolName, toolInput, category)

  // Response state — auto-approved or persisted decisions start as already responded
  const initialDecision = autoApproved ? 'allowed' : persistedDecision
  const [responded, setResponded] = useState(!!initialDecision)
  const [decision, setDecision] = useState<'allowed' | 'denied' | null>(initialDecision)
  const [rememberChecked, setRememberChecked] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [sendFailed, setSendFailed] = useState(false)

  // Sync with persisted decision arriving via broadcast after initial render
  if (persistedDecision && !responded) {
    setResponded(true)
    setDecision(persistedDecision)
  }

  // Entrance animation
  const [mounted, setMounted] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  const handleRespond = (allowed: boolean) => {
    if (responded) return
    const remember = canRemember && rememberChecked && allowed ? { toolName } : undefined
    // Only show the decision once it was actually delivered: on a dead socket
    // onRespond returns false and the agent is still waiting for an answer.
    if (onRespond(toolCallId, allowed, remember) === false) {
      setSendFailed(true)
      return
    }
    setSendFailed(false)
    setResponded(true)
    setDecision(allowed ? 'allowed' : 'denied')
  }

  const isPending = !responded && !disabled

  // ─── Compact "decided" view: single line ────────────────────────────
  if (responded) {
    return (
      <div
        ref={containerRef}
        className={`my-1 flex items-center gap-2 rounded border-l-2 ${styles.border} ${styles.bg} border-white/[0.04] px-2.5 py-1.5 transition-all duration-200 ${
          mounted ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <CategoryIcon category={category} className={`w-3.5 h-3.5 shrink-0 ${styles.icon}`} />
        <span className={`text-[11px] font-medium ${styles.text}`}>{styles.label}</span>
        <span className="text-[11px] text-gray-400 truncate flex-1" title={toolName}>
          {summary}
        </span>
        {decision === 'allowed' ? (
          <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400/80 shrink-0">
            <Check className="w-3 h-3" />
            {autoApproved ? 'Auto' : 'Allowed'}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[11px] font-medium text-red-400/80 shrink-0">
            <X className="w-3 h-3" />
            Denied
          </span>
        )}
      </div>
    )
  }

  // ─── No interactive permissions: nothing to answer ──────────────────
  // The provider cannot pause a tool call, so Allow / Deny would be buttons
  // that do nothing. The request is shown for what it is: decided by policy.
  if (!caps.interactive_permissions) {
    return (
      <div
        ref={containerRef}
        data-testid="permission-policy-only"
        className={`my-1 rounded border-l-2 ${styles.border} ${styles.bg} border-white/[0.04] px-2.5 py-1.5`}
      >
        <div className="flex items-center gap-2">
          <CategoryIcon category={category} className={`w-3.5 h-3.5 shrink-0 ${styles.icon}`} />
          <span className={`text-[11px] font-medium ${styles.text}`}>{styles.label}</span>
          <span className="text-[11px] text-gray-400 truncate flex-1" title={toolName}>
            {summary}
          </span>
        </div>
        <p className="mt-0.5 text-[10px] text-gray-500">{POLICY_ONLY_REQUEST_TEXT}</p>
      </div>
    )
  }

  // ─── Pending view: compact but with actions ─────────────────────────
  return (
    <div
      ref={containerRef}
      className={`my-1.5 rounded-lg border-l-2 border ${styles.border} ${styles.bg} border-white/[0.06] overflow-hidden transition-all duration-200 ease-out ${
        mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
      }`}
      style={{
        animation: isPending ? 'permission-pulse 2.5s ease-in-out infinite' : 'none',
      }}
    >
      {isPending && (
        <style>{`
          @keyframes permission-pulse {
            0%, 100% { border-color: rgba(255,255,255,0.06); }
            50% { border-color: rgba(255,255,255,0.12); }
          }
        `}</style>
      )}

      <div className="px-2.5 py-2">
        {/* Header line: icon + label + summary + waiting dot */}
        <div className="flex items-center gap-2 mb-1.5">
          <CategoryIcon category={category} className={`w-3.5 h-3.5 shrink-0 ${styles.icon}`} />
          <span className={`text-[11px] font-medium ${styles.text}`}>
            {styles.label}: {summary}
          </span>
          <span className="ml-auto text-[10px] text-amber-400/60 flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          </span>
        </div>

        {/* Expandable detail */}
        {detail && (
          <div className="mb-1.5">
            <button
              onClick={() => setShowDetail(!showDetail)}
              className="text-[10px] text-gray-500 hover:text-gray-400 transition-colors flex items-center gap-1"
            >
              <ChevronRight className={`w-2.5 h-2.5 transition-transform ${showDetail ? 'rotate-90' : ''}`} />
              {showDetail ? 'Hide' : 'Details'}
            </button>
            {showDetail && (
              <pre
                className={`mt-1 text-[10px] rounded bg-black/30 border border-white/[0.04] p-1.5 overflow-x-auto max-h-36 ${
                  language === 'bash'
                    ? 'text-amber-300/80'
                    : language === 'json'
                      ? 'text-purple-300/80'
                      : language === 'diff'
                        ? 'text-blue-300/80'
                        : 'text-gray-400'
                }`}
              >
                <code>{detail}</code>
              </pre>
            )}
          </div>
        )}

        {/* Actions: buttons + remember inline */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleRespond(true)}
            disabled={disabled}
            className="px-2.5 py-1 text-[11px] font-medium rounded bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            <Check className="w-3 h-3" />
            Allow
          </button>
          <button
            onClick={() => handleRespond(false)}
            disabled={disabled}
            className="px-2.5 py-1 text-[11px] font-medium rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Deny
          </button>
{/* Offered only when the provider can remember an answer for the session. */}
          {canRemember && (
                    <label className="flex items-center gap-1 cursor-pointer ml-auto">
              <input
                type="checkbox"
                checked={rememberChecked}
                onChange={(e) => setRememberChecked(e.target.checked)}
                className="w-3 h-3 rounded border-gray-600 bg-white/[0.04] text-indigo-500 focus:ring-indigo-500/30 focus:ring-offset-0"
              />
              <span className="text-[10px] text-gray-500">Remember</span>
            </label>
          )}
        </div>
        {sendFailed && (
          <p role="alert" className="mt-1.5 text-[10px] text-red-400">
            Not sent: connection lost. Try again once reconnected.
          </p>
        )}
      </div>
    </div>
  )
}
