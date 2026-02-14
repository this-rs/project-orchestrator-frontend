import { useAtom } from 'jotai'
import { useCallback, useState } from 'react'
import { setupConfigAtom, type McpSetupStatus } from '@/atoms/setup'
import { isTauri } from '@/services/env'

const MODELS = [
  { value: 'sonnet-4-5', label: 'Claude Sonnet 4.5', description: 'Fast & capable — best for most tasks' },
  { value: 'opus-4-5', label: 'Claude Opus 4.5', description: 'Most intelligent — complex reasoning' },
  { value: 'opus-4-6', label: 'Claude Opus 4.6', description: 'Latest & most powerful' },
]

const PERMISSION_MODES = [
  {
    value: 'bypassPermissions' as const,
    label: 'Bypass',
    description: 'All tools auto-approved — no permission prompts',
  },
  {
    value: 'default' as const,
    label: 'Default',
    description: 'Asks approval for file edits and shell commands',
  },
  {
    value: 'acceptEdits' as const,
    label: 'Accept Edits',
    description: 'File edits auto-approved, shell commands need approval',
  },
  {
    value: 'plan' as const,
    label: 'Plan Only',
    description: 'Read-only mode — Claude can read but not modify files',
  },
]

export function ChatPage() {
  const [config, setConfig] = useAtom(setupConfigAtom)
  const [detectAttempted, setDetectAttempted] = useState(false)

  const update = (patch: Partial<typeof config>) =>
    setConfig((prev) => ({ ...prev, ...patch }))

  // Detect Claude Code CLI via Tauri invoke
  const handleDetect = useCallback(async () => {
    setDetectAttempted(true)
    if (!isTauri) {
      update({ claudeCodeDetected: false })
      return
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const detected = await invoke<boolean>('detect_claude_code')
      update({ claudeCodeDetected: detected })
    } catch {
      update({ claudeCodeDetected: false })
    }
  }, [])

  // Configure Claude Code MCP server via Tauri invoke
  const handleConfigureMcp = useCallback(async () => {
    if (!isTauri) return

    update({ mcpSetupStatus: 'configuring' as McpSetupStatus, mcpSetupMessage: '' })

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const result = await invoke<{
        success: boolean
        method: string
        message: string
        filePath: string | null
      }>('setup_claude_code', { serverUrl: `http://localhost:${config.serverPort}/mcp/sse` })

      if (result.success) {
        const status: McpSetupStatus =
          result.method === 'already_configured' ? 'already_configured' : 'configured'
        update({ mcpSetupStatus: status, mcpSetupMessage: result.message })
      } else {
        update({
          mcpSetupStatus: 'error' as McpSetupStatus,
          mcpSetupMessage: result.message,
        })
      }
    } catch (e) {
      update({
        mcpSetupStatus: 'error' as McpSetupStatus,
        mcpSetupMessage: e instanceof Error ? e.message : 'Unknown error',
      })
    }
  }, [config.serverPort])

  const mcpSuccess =
    config.mcpSetupStatus === 'configured' || config.mcpSetupStatus === 'already_configured'

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Chat AI</h2>
        <p className="mt-1 text-sm text-gray-400">
          Configure the built-in AI chat assistant. These settings are optional and can be changed
          later.
        </p>
      </div>

      {/* Model selection */}
      <div className="space-y-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div>
          <label className="mb-3 block text-xs font-medium text-gray-400">Default Model</label>
          <div className="grid gap-3 sm:grid-cols-3">
            {MODELS.map((m) => (
              <button
                key={m.value}
                onClick={() => update({ chatModel: m.value })}
                className={`flex flex-col items-start gap-1.5 rounded-xl border p-4 text-left transition ${
                  config.chatModel === m.value
                    ? 'border-indigo-500/50 bg-indigo-500/10'
                    : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span
                    className={`text-sm font-medium ${config.chatModel === m.value ? 'text-white' : 'text-gray-300'}`}
                  >
                    {m.label}
                  </span>
                  {config.chatModel === m.value && (
                    <svg
                      className="h-4 w-4 text-indigo-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </div>
                <span className="text-xs text-gray-500">{m.description}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            The model used for AI chat sessions. Requires a Claude Code CLI installation.
          </p>
        </div>

        {/* Max sessions */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-400">
            Max Concurrent Sessions
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={1}
              max={10}
              value={config.chatMaxSessions}
              onChange={(e) => update({ chatMaxSessions: parseInt(e.target.value) })}
              className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-white/[0.1] accent-indigo-600"
            />
            <span className="w-8 text-center text-sm font-medium text-white">
              {config.chatMaxSessions}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-gray-500">
            Maximum number of AI chat sessions that can run simultaneously.
          </p>
        </div>

        {/* Max turns */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-400">
            Max Turns per Message
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={1}
              max={500}
              value={config.chatMaxTurns}
              onChange={(e) => update({ chatMaxTurns: parseInt(e.target.value) })}
              className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-white/[0.1] accent-indigo-600"
            />
            <span className="w-10 text-center text-sm font-medium text-white">
              {config.chatMaxTurns}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-gray-500">
            Maximum number of agentic turns (tool calls) the AI can take per message.
          </p>
        </div>
      </div>

      {/* Permission mode */}
      <div className="space-y-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">Permission Mode</label>
          <p className="mb-3 text-xs text-gray-500">
            Controls whether Claude asks for your approval before executing tools like file edits
            and shell commands.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {PERMISSION_MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => update({ chatPermissionMode: m.value })}
                className={`flex flex-col items-start gap-1.5 rounded-xl border p-4 text-left transition ${
                  config.chatPermissionMode === m.value
                    ? 'border-indigo-500/50 bg-indigo-500/10'
                    : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span
                    className={`text-sm font-medium ${config.chatPermissionMode === m.value ? 'text-white' : 'text-gray-300'}`}
                  >
                    {m.label}
                  </span>
                  {config.chatPermissionMode === m.value && (
                    <svg
                      className="h-4 w-4 text-indigo-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </div>
                <span className="text-xs text-gray-500">{m.description}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Claude Code detection + MCP configuration */}
      <div className="space-y-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
        {/* Detection */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium text-gray-300">Claude Code CLI</h3>
            <p className="mt-1 text-xs text-gray-500">
              The chat feature requires Claude Code to be installed on this machine. Click detect to
              check if it&apos;s available.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {config.claudeCodeDetected && (
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-400">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Detected
              </span>
            )}
            {detectAttempted && !config.claudeCodeDetected && (
              <span className="flex items-center gap-1 text-xs font-medium text-amber-400">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                  />
                </svg>
                Not found
              </span>
            )}
            <button
              onClick={handleDetect}
              className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:bg-white/[0.08]"
            >
              Detect
            </button>
          </div>
        </div>

        {/* MCP Configuration separator */}
        <div className="border-t border-white/[0.06] pt-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium text-gray-300">MCP Server Configuration</h3>
              <p className="mt-1 text-xs text-gray-500">
                Configure Claude Code to use Project Orchestrator as an MCP server. This enables
                Claude Code to access your projects, plans, and knowledge graph.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {mcpSuccess && (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-400">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  {config.mcpSetupStatus === 'already_configured' ? 'Already configured' : 'Configured'}
                </span>
              )}
              <button
                onClick={handleConfigureMcp}
                disabled={config.mcpSetupStatus === 'configuring' || mcpSuccess}
                className="rounded-lg border border-white/[0.1] bg-indigo-600/20 px-3 py-1.5 text-xs font-medium text-indigo-300 transition hover:bg-indigo-600/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {config.mcpSetupStatus === 'configuring' ? (
                  <span className="flex items-center gap-1.5">
                    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Configuring…
                  </span>
                ) : (
                  'Configure MCP'
                )}
              </button>
            </div>
          </div>

          {/* Status message */}
          {config.mcpSetupStatus === 'error' && (
            <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {config.mcpSetupMessage}
            </div>
          )}
          {mcpSuccess && config.mcpSetupMessage && (
            <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
              {config.mcpSetupMessage}
            </div>
          )}
        </div>
      </div>

      {/* Info box */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="flex gap-3">
          <svg
            className="mt-0.5 h-5 w-5 shrink-0 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
            />
          </svg>
          <p className="text-xs text-gray-500">
            These settings can be changed at any time in{' '}
            <code className="rounded bg-white/[0.06] px-1 py-0.5 text-gray-400">config.yaml</code>
            . If you don&apos;t use the AI chat feature, you can skip this step. You can also
            configure the MCP server later by running{' '}
            <code className="rounded bg-white/[0.06] px-1 py-0.5 text-gray-400">
              orchestrator setup-claude
            </code>
            .
          </p>
        </div>
      </div>
    </div>
  )
}
