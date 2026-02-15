import type { ContentBlock } from '@/types'

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
      <svg
        className="w-3.5 h-3.5 text-gray-500 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
        />
      </svg>

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
