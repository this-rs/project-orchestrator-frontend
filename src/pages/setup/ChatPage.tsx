import { useAtom } from 'jotai'
import { setupConfigAtom } from '@/atoms/setup'

const MODELS = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
  { value: 'claude-haiku-3-20250414', label: 'Claude Haiku 3.5' },
]

export function ChatPage() {
  const [config, setConfig] = useAtom(setupConfigAtom)

  const update = (patch: Partial<typeof config>) =>
    setConfig((prev) => ({ ...prev, ...patch }))

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Chat AI</h2>
        <p className="mt-1 text-sm text-gray-400">
          Configure the built-in AI chat assistant. These settings are optional and can be changed later.
        </p>
      </div>

      {/* Model selection */}
      <div className="space-y-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-400">Default Model</label>
          <select
            value={config.chatModel}
            onChange={(e) => update({ chatModel: e.target.value })}
            className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white transition focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
          >
            {MODELS.map((m) => (
              <option key={m.value} value={m.value} className="bg-gray-900">
                {m.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-gray-500">
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
      </div>

      {/* Claude Code detection */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium text-gray-300">Claude Code CLI</h3>
            <p className="mt-1 text-xs text-gray-500">
              The chat feature requires Claude Code to be installed on this machine.
              Click detect to check if it&apos;s available.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {config.claudeCodeDetected && (
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Detected
              </span>
            )}
            <button
              onClick={() => {
                // In Tauri: invoke('detect_claude_code')
                // For now, just simulate detection
                update({ claudeCodeDetected: true })
              }}
              className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:bg-white/[0.08]"
            >
              Detect
            </button>
          </div>
        </div>
      </div>

      {/* Info box */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="flex gap-3">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <p className="text-xs text-gray-500">
            These settings can be changed at any time in{' '}
            <code className="rounded bg-white/[0.06] px-1 py-0.5 text-gray-400">config.yaml</code>
            . If you don&apos;t use the AI chat feature, you can skip this step.
          </p>
        </div>
      </div>
    </div>
  )
}
