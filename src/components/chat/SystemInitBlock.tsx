import type { ContentBlock } from '@/types'
import { Settings } from 'lucide-react'

interface SystemInitBlockProps {
  block: ContentBlock
}

export function SystemInitBlock({ block }: SystemInitBlockProps) {
  const model = block.metadata?.model as string | undefined
  const toolsCount = (block.metadata?.tools_count as number) ?? 0
  const mcpServersCount = (block.metadata?.mcp_servers_count as number) ?? 0
  const permissionMode = block.metadata?.permission_mode as string | undefined

  return (
    <div className="flex items-center gap-2 py-1.5 my-1 flex-wrap">
      {/* Settings icon */}
      <Settings className="w-3.5 h-3.5 text-gray-500 shrink-0" />

      <span className="text-xs text-gray-500">Session initialized</span>

      {model && (
        <span className="px-1.5 py-0.5 bg-indigo-600/20 text-indigo-300 text-[10px] rounded font-medium">
          {model}
        </span>
      )}

      {toolsCount > 0 && (
        <span className="px-1.5 py-0.5 bg-gray-700/50 text-gray-400 text-[10px] rounded">
          {toolsCount} tools
        </span>
      )}

      {mcpServersCount > 0 && (
        <span className="px-1.5 py-0.5 bg-gray-700/50 text-gray-400 text-[10px] rounded">
          {mcpServersCount} MCP servers
        </span>
      )}

      {permissionMode && (
        <span className="px-1.5 py-0.5 bg-orange-600/20 text-orange-300 text-[10px] rounded">
          {permissionMode}
        </span>
      )}
    </div>
  )
}
