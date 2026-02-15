import { useState, useEffect, useRef } from 'react'
import type { ContentBlock } from '@/types'

// ---------------------------------------------------------------------------
// Tool category classification + colors
// ---------------------------------------------------------------------------

type ToolCategory = 'bash' | 'read' | 'edit' | 'mcp' | 'web' | 'other'

function classifyTool(toolName: string): ToolCategory {
  const lower = toolName.toLowerCase()
  if (lower === 'bash') return 'bash'
  if (lower === 'read' || lower === 'glob' || lower === 'grep') return 'read'
  if (lower === 'edit' || lower === 'write' || lower === 'notebookedit') return 'edit'
  if (lower.startsWith('mcp__') || lower.startsWith('mcp_')) return 'mcp'
  if (lower === 'webfetch' || lower === 'websearch') return 'web'
  return 'other'
}

const CATEGORY_STYLES: Record<
  ToolCategory,
  {
    border: string
    bg: string
    text: string
    icon: string
    label: string
  }
> = {
  bash: {
    border: 'border-l-amber-500/40',
    bg: 'bg-amber-950/20',
    text: 'text-amber-400',
    icon: 'text-amber-400',
    label: 'Command',
  },
  read: {
    border: 'border-l-emerald-500/40',
    bg: 'bg-emerald-950/20',
    text: 'text-emerald-400',
    icon: 'text-emerald-400',
    label: 'Read',
  },
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
  other: {
    border: 'border-l-gray-500/40',
    bg: 'bg-gray-950/20',
    text: 'text-gray-400',
    icon: 'text-gray-400',
    label: 'Tool',
  },
}

// ---------------------------------------------------------------------------
// Tool input formatter
// ---------------------------------------------------------------------------

function formatToolSummary(
  toolName: string,
  input: Record<string, unknown> | undefined,
): { summary: string; detail: string | null; language: string } {
  if (!input || Object.keys(input).length === 0) {
    return { summary: toolName, detail: null, language: 'text' }
  }

  const category = classifyTool(toolName)

  switch (category) {
    case 'bash': {
      const command = (input.command as string) || ''
      const desc = (input.description as string) || ''
      return { summary: desc || command.slice(0, 80) || 'Execute command', detail: command, language: 'bash' }
    }
    case 'read': {
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
    case 'bash':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      )
    case 'read':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
          />
        </svg>
      )
    case 'edit':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
      )
    case 'mcp':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      )
    case 'web':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
          />
        </svg>
      )
    default:
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
      )
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface PermissionRequestBlockProps {
  block: ContentBlock
  onRespond: (toolCallId: string, allowed: boolean, remember?: { toolName: string }) => void
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

  const category = classifyTool(toolName)
  const styles = CATEGORY_STYLES[category]
  const { summary, detail, language } = formatToolSummary(toolName, toolInput)

  // Response state — auto-approved or persisted decisions start as already responded
  const initialDecision = autoApproved ? 'allowed' : persistedDecision
  const [responded, setResponded] = useState(!!initialDecision)
  const [decision, setDecision] = useState<'allowed' | 'denied' | null>(initialDecision)
  const [rememberChecked, setRememberChecked] = useState(false)
  const [showDetail, setShowDetail] = useState(false)

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
    setResponded(true)
    setDecision(allowed ? 'allowed' : 'denied')
    const remember = rememberChecked && allowed ? { toolName } : undefined
    onRespond(toolCallId, allowed, remember)
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
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {autoApproved ? 'Auto' : 'Allowed'}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[11px] font-medium text-red-400/80 shrink-0">
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Denied
          </span>
        )}
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
              <svg
                className={`w-2.5 h-2.5 transition-transform ${showDetail ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
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
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Allow
          </button>
          <button
            onClick={() => handleRespond(false)}
            disabled={disabled}
            className="px-2.5 py-1 text-[11px] font-medium rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Deny
          </button>
          <label className="flex items-center gap-1 cursor-pointer ml-auto">
            <input
              type="checkbox"
              checked={rememberChecked}
              onChange={(e) => setRememberChecked(e.target.checked)}
              className="w-3 h-3 rounded border-gray-600 bg-white/[0.04] text-indigo-500 focus:ring-indigo-500/30 focus:ring-offset-0"
            />
            <span className="text-[10px] text-gray-500">Remember</span>
          </label>
        </div>
      </div>
    </div>
  )
}
