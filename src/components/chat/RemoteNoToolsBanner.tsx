import { Server } from 'lucide-react'
import { REMOTE_NO_TOOLS_FR } from '@/constants/remoteClaudeCode'

/**
 * Shown above the composer on a conversation run by a Claude Code on another
 * machine: it has no per-session MCP server, so no PO tools in this version.
 */
export function RemoteNoToolsBanner({ machine }: { machine: string }) {
  return (
    <div
      role="note"
      data-testid="remote-no-tools-banner"
      className="mx-3 mb-1 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-200"
    >
      <Server className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
      <p className="min-w-0">
        <span className="font-medium text-amber-100">{machine}</span>{' '}
        <span className="text-amber-200/80">{REMOTE_NO_TOOLS_FR}</span>
      </p>
    </div>
  )
}
