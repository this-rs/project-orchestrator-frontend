import type { ContentBlock } from '@/types'

interface PermissionRequestBlockProps {
  block: ContentBlock
  onRespond: (toolCallId: string, allowed: boolean) => void
  disabled?: boolean
}

export function PermissionRequestBlock({ block, onRespond, disabled }: PermissionRequestBlockProps) {
  const toolCallId = block.metadata?.tool_call_id as string
  const toolName = block.metadata?.tool_name as string

  return (
    <div className="my-2 rounded-lg bg-amber-900/10 border border-amber-500/20 p-3">
      <div className="flex items-center gap-2 mb-2">
        <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <span className="text-xs text-amber-400 font-medium">Permission requested</span>
      </div>
      <p className="text-sm text-gray-300 mb-1">{block.content}</p>
      {toolName && (
        <p className="text-xs text-gray-500 mb-3 font-mono">{toolName}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => onRespond(toolCallId, true)}
          disabled={disabled}
          className="px-3 py-1 text-xs font-medium rounded bg-green-600/20 text-green-400 hover:bg-green-600/30 transition-colors disabled:opacity-50"
        >
          Allow
        </button>
        <button
          onClick={() => onRespond(toolCallId, false)}
          disabled={disabled}
          className="px-3 py-1 text-xs font-medium rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors disabled:opacity-50"
        >
          Deny
        </button>
      </div>
    </div>
  )
}
