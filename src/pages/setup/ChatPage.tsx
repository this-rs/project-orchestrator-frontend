import { useAtom, useSetAtom, useAtomValue } from 'jotai'
import { useCallback, useEffect, useState } from 'react'
import { Check, CheckCircle2, AlertCircle, Loader2, RotateCw, Download, XCircle } from 'lucide-react'
import { setupConfigAtom, chatValidAtom, trayNavigationAtom, type McpSetupStatus } from '@/atoms/setup'
import { isTauri } from '@/services/env'
import { useToast } from '@/hooks'
import { AVAILABLE_MODELS } from '@/constants/models'
import type { CliVersionStatus } from '@/types'

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
  const setChatValid = useSetAtom(chatValidAtom)
  const isTrayNavigation = useAtomValue(trayNavigationAtom)
  const [detectingPath, setDetectingPath] = useState(false)
  const [cliStatus, setCliStatus] = useState<CliVersionStatus | null>(null)
  const [checkingCli, setCheckingCli] = useState(false)
  const [installingCli, setInstallingCli] = useState(false)
  const [cliDetected, setCliDetected] = useState(false)
  const [cliAutoChecked, setCliAutoChecked] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)
  // Embedding model states
  const [embeddingReady, setEmbeddingReady] = useState(config.embeddingProvider === 'disabled')
  const [embeddingModelChecked, setEmbeddingModelChecked] = useState(false)
  const [embeddingModelAvailable, setEmbeddingModelAvailable] = useState(false)
  const [embeddingEstimatedSize, setEmbeddingEstimatedSize] = useState(0)
  const [downloadingModel, setDownloadingModel] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  // HTTP embedding endpoint test states
  const [embeddingTestResult, setEmbeddingTestResult] = useState<{ success: boolean; dimensions?: number; latencyMs?: number } | null>(null)
  const [testingEmbedding, setTestingEmbedding] = useState(false)
  const toast = useToast()

  const update = (patch: Partial<typeof config>) =>
    setConfig((prev) => ({ ...prev, ...patch }))

  // ── Auto-detect CLI at mount ──────────────────────────────────────
  useEffect(() => {
    if (!isTauri || cliAutoChecked) return
    let cancelled = false
    ;(async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const status = await invoke<CliVersionStatus>('check_cli_status')
        if (cancelled) return
        setCliStatus(status)
        const detected = status.installed
        setCliDetected(detected)
        setConfig((prev) => ({ ...prev, claudeCodeDetected: detected }))
      } catch {
        if (!cancelled) {
          setCliDetected(false)
        }
      } finally {
        if (!cancelled) setCliAutoChecked(true)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [])

  // ── Propagate chatValidAtom ──────────────────────────────────────
  useEffect(() => {
    if (isTrayNavigation) {
      setChatValid(true)
      return
    }
    if (!isTauri) {
      setChatValid(true)
      return
    }
    setChatValid(cliDetected && embeddingReady)
  }, [cliDetected, embeddingReady, isTrayNavigation, setChatValid])

  // ── Check local embedding model availability ────────────────────────
  useEffect(() => {
    if (config.embeddingProvider !== 'local' || !isTauri) return
    let cancelled = false
    setEmbeddingModelChecked(false)
    ;(async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const status = await invoke<{ available: boolean; cachePath: string | null; estimatedSizeMb: number }>(
          'check_embedding_model', { modelName: config.embeddingFastembedModel }
        )
        if (cancelled) return
        setEmbeddingModelAvailable(status.available)
        setEmbeddingEstimatedSize(status.estimatedSizeMb)
        setEmbeddingReady(status.available)
      } catch {
        if (!cancelled) {
          setEmbeddingModelAvailable(false)
          setEmbeddingReady(false)
        }
      } finally {
        if (!cancelled) setEmbeddingModelChecked(true)
      }
    })()
    return () => { cancelled = true }
  }, [config.embeddingProvider, config.embeddingFastembedModel])

  // ── Update embeddingReady when provider changes ────────────────────
  useEffect(() => {
    if (config.embeddingProvider === 'disabled') {
      setEmbeddingReady(true)
    } else if (config.embeddingProvider === 'http') {
      // HTTP: ready only after successful test
      setEmbeddingReady(embeddingTestResult?.success === true)
    }
    // local provider is handled by the check_embedding_model useEffect above
  }, [config.embeddingProvider, embeddingTestResult])

  // ── Reset HTTP test when URL/model/apiKey change ───────────────────
  useEffect(() => {
    if (config.embeddingProvider !== 'http') return
    setEmbeddingTestResult(null)
    setEmbeddingReady(false)
  }, [config.embeddingUrl, config.embeddingModel, config.embeddingApiKey, config.embeddingProvider])

  // Auto-detect PATH on mount when running in Tauri and no PATH is set yet
  useEffect(() => {
    if (!isTauri || config.chatProcessPath) return
    let cancelled = false
    ;(async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const path = await invoke<string | null>('detect_shell_path')
        if (!cancelled && path) {
          setConfig((prev) => prev.chatProcessPath ? prev : { ...prev, chatProcessPath: path })
        }
      } catch { /* silently ignore — user can detect manually */ }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- update is a local helper that changes on every render
  }, [config.serverPort])

  // Detect PATH from login shell (Tauri-only, no backend needed)
  const handleDetectPath = useCallback(async () => {
    if (!isTauri) return
    try {
      setDetectingPath(true)
      const { invoke } = await import('@tauri-apps/api/core')
      const path = await invoke<string | null>('detect_shell_path')
      if (path) {
        update({ chatProcessPath: path })
        toast.success('PATH detected from login shell')
      } else {
        toast.error('Could not detect PATH from login shell')
      }
    } catch {
      toast.error('Failed to detect PATH')
    } finally {
      setDetectingPath(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- update is a local helper
  }, [toast])

  // Check CLI version via Tauri invoke (no backend/auth required)
  const handleCheckCli = useCallback(async () => {
    try {
      setCheckingCli(true)
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core')
        const status = await invoke<CliVersionStatus>('check_cli_status')
        setCliStatus(status)
        setCliDetected(status.installed)
        setConfig((prev) => ({ ...prev, claudeCodeDetected: status.installed }))
      } else {
        toast.error('CLI check is only available in the desktop app')
      }
    } catch {
      toast.error('Failed to check CLI status')
    } finally {
      setCheckingCli(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setConfig changes on render
  }, [toast])

  // Install/update CLI via Tauri invoke (no backend/auth required)
  const handleInstallCli = useCallback(async (version?: string) => {
    try {
      setInstallingCli(true)
      setInstallError(null)
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core')
        const result = await invoke<{ success: boolean; version: string | null; message: string; cli_path: string | null }>('install_cli', { version: version ?? null })
        if (result.success) {
          toast.success(result.message)
          // Refresh status after install — update cliDetected
          const status = await invoke<CliVersionStatus>('check_cli_status')
          setCliStatus(status)
          setCliDetected(status.installed)
          setConfig((prev) => ({ ...prev, claudeCodeDetected: status.installed }))
        } else {
          setInstallError(result.message)
          toast.error(result.message)
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to install CLI'
      setInstallError(msg)
      toast.error(msg)
    } finally {
      setInstallingCli(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setConfig changes on render
  }, [toast])

  // ── Download local ONNX model ────────────────────────────────────
  const handleDownloadModel = useCallback(async () => {
    if (!isTauri) return
    setDownloadingModel(true)
    setDownloadError(null)
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const result = await invoke<{ success: boolean; modelPath: string; error: string | null }>(
        'download_embedding_model', { modelName: config.embeddingFastembedModel }
      )
      if (result.success) {
        setEmbeddingModelAvailable(true)
        setEmbeddingReady(true)
        toast.success('Embedding model downloaded successfully')
      } else {
        setDownloadError(result.error || 'Download failed')
        toast.error(result.error || 'Download failed')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Download failed'
      setDownloadError(msg)
      toast.error(msg)
    } finally {
      setDownloadingModel(false)
    }
  }, [config.embeddingFastembedModel, toast])

  // ── Test HTTP embedding endpoint ────────────────────────────────────
  const handleTestEmbedding = useCallback(async () => {
    if (!isTauri) return
    setTestingEmbedding(true)
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const result = await invoke<{ success: boolean; dimensions: number | null; latencyMs: number; error: string | null }>(
        'test_embedding_endpoint', {
          url: config.embeddingUrl,
          model: config.embeddingModel,
          apiKey: config.embeddingApiKey || null,
        }
      )
      setEmbeddingTestResult({
        success: result.success,
        dimensions: result.dimensions ?? undefined,
        latencyMs: result.latencyMs,
      })
      if (result.success) {
        setEmbeddingReady(true)
        if (result.dimensions) {
          update({ embeddingDimensions: result.dimensions })
        }
        toast.success(`Endpoint OK — ${result.dimensions}d, ${result.latencyMs}ms`)
      } else {
        setEmbeddingReady(false)
        toast.error(result.error || 'Test failed')
      }
    } catch (e) {
      setEmbeddingTestResult({ success: false })
      setEmbeddingReady(false)
      toast.error(e instanceof Error ? e.message : 'Test failed')
    } finally {
      setTestingEmbedding(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- update changes on render
  }, [config.embeddingUrl, config.embeddingModel, config.embeddingApiKey, toast])

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
            {AVAILABLE_MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => update({ chatModel: m.id })}
                className={`flex flex-col items-start gap-1.5 rounded-xl border p-4 text-left transition ${
                  config.chatModel === m.id
                    ? 'border-indigo-500/50 bg-indigo-500/10'
                    : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span
                    className={`text-sm font-medium ${config.chatModel === m.id ? 'text-white' : 'text-gray-300'}`}
                  >
                    {m.fullLabel}
                  </span>
                  {config.chatModel === m.id && (
                    <Check className="h-4 w-4 text-indigo-400" />
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
                    <Check className="h-4 w-4 text-indigo-400" />
                  )}
                </div>
                <span className="text-xs text-gray-500">{m.description}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Embedding Provider */}
      <div className="space-y-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div>
          <h3 className="text-sm font-medium text-gray-300">Embedding Provider</h3>
          <p className="mt-1 text-xs text-gray-500">
            Vector embeddings power semantic search on knowledge notes and automatic synapse creation.
          </p>
        </div>

        {/* Provider selection */}
        <div className="grid gap-3 sm:grid-cols-3">
          {([
            { value: 'local' as const, label: 'Local (ONNX)', description: 'In-process inference via fastembed — no external dependency' },
            { value: 'http' as const, label: 'HTTP API', description: 'OpenAI-compatible endpoint (Ollama, OpenAI, vLLM…)' },
            { value: 'disabled' as const, label: 'Disabled', description: 'No embeddings — semantic search unavailable' },
          ]).map((p) => (
            <button
              key={p.value}
              onClick={() => update({ embeddingProvider: p.value })}
              className={`flex flex-col items-start gap-1.5 rounded-xl border p-4 text-left transition ${
                config.embeddingProvider === p.value
                  ? 'border-indigo-500/50 bg-indigo-500/10'
                  : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span className={`text-sm font-medium ${config.embeddingProvider === p.value ? 'text-white' : 'text-gray-300'}`}>
                  {p.label}
                </span>
                {config.embeddingProvider === p.value && <Check className="h-4 w-4 text-indigo-400" />}
              </div>
              <span className="text-xs text-gray-500">{p.description}</span>
            </button>
          ))}
        </div>

        {/* Local model picker */}
        {config.embeddingProvider === 'local' && (
          <div className="border-t border-white/[0.06] pt-4 space-y-2">
            <label className="block text-xs font-medium text-gray-400">FastEmbed Model</label>
            <select
              value={config.embeddingFastembedModel}
              onChange={(e) => update({ embeddingFastembedModel: e.target.value })}
              className="w-full rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-gray-200 focus:border-indigo-500/40 focus:outline-none"
            >
              <optgroup label="Multilingual (recommended)">
                <option value="multilingual-e5-base">multilingual-e5-base (768d, ~400 MB)</option>
                <option value="multilingual-e5-small">multilingual-e5-small (384d, ~120 MB)</option>
                <option value="multilingual-e5-large">multilingual-e5-large (1024d, ~1.1 GB)</option>
              </optgroup>
              <optgroup label="English only">
                <option value="bge-small-en-v1.5">bge-small-en-v1.5 (384d)</option>
                <option value="bge-base-en-v1.5">bge-base-en-v1.5 (768d)</option>
                <option value="all-minilm-l6-v2">all-MiniLM-L6-v2 (384d)</option>
                <option value="nomic-embed-text-v1.5">nomic-embed-text-v1.5 (768d)</option>
                <option value="gte-base-en-v1.5">gte-base-en-v1.5 (768d)</option>
              </optgroup>
              <optgroup label="Large / High-quality">
                <option value="bge-m3">bge-m3 (1024d, multilingual)</option>
                <option value="bge-large-en-v1.5">bge-large-en-v1.5 (1024d)</option>
                <option value="snowflake-arctic-embed-l">snowflake-arctic-embed-l (1024d)</option>
              </optgroup>
            </select>
            <p className="text-xs text-gray-500">
              Default: <span className="font-mono">multilingual-e5-base</span> — multilingual FR/EN support, 768 dimensions.
            </p>

            {/* Model availability status */}
            {isTauri && !embeddingModelChecked && (
              <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                <span className="text-xs text-gray-400">Checking model cache…</span>
              </div>
            )}

            {isTauri && embeddingModelChecked && embeddingModelAvailable && (
              <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.08] p-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-medium text-emerald-400">Model downloaded — ready to use</span>
              </div>
            )}

            {isTauri && embeddingModelChecked && !embeddingModelAvailable && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 space-y-2">
                <div className="flex items-start gap-3">
                  <Download className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-amber-400">Model not downloaded</p>
                    <p className="text-xs text-gray-400">
                      The ONNX model needs to be downloaded before embeddings can work.
                      {embeddingEstimatedSize > 0 && (
                        <span className="ml-1 text-gray-500">
                          Estimated size: ~{embeddingEstimatedSize >= 1000 ? `${(embeddingEstimatedSize / 1000).toFixed(1)} GB` : `${embeddingEstimatedSize} MB`}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {downloadError && (
                  <p className="rounded border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs text-red-300">
                    {downloadError}
                  </p>
                )}
                <button
                  onClick={handleDownloadModel}
                  disabled={downloadingModel}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-medium text-amber-300 transition hover:bg-amber-500/25 disabled:opacity-50"
                >
                  {downloadingModel ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Downloading model — this may take a minute…
                    </>
                  ) : (
                    <>
                      <Download className="h-3.5 w-3.5" />
                      {downloadError ? 'Retry Download' : `Download Model${embeddingEstimatedSize > 0 ? ` (~${embeddingEstimatedSize >= 1000 ? `${(embeddingEstimatedSize / 1000).toFixed(1)} GB` : `${embeddingEstimatedSize} MB`})` : ''}`}
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* HTTP provider settings */}
        {config.embeddingProvider === 'http' && (
          <div className="border-t border-white/[0.06] pt-4 space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-400">Endpoint URL</label>
              <input
                value={config.embeddingUrl}
                onChange={(e) => update({ embeddingUrl: e.target.value })}
                placeholder="http://localhost:11434/v1/embeddings"
                className="w-full rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-indigo-500/40 focus:outline-none font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-400">Model</label>
                <input
                  value={config.embeddingModel}
                  onChange={(e) => update({ embeddingModel: e.target.value })}
                  placeholder="nomic-embed-text"
                  className="w-full rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-indigo-500/40 focus:outline-none font-mono"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-400">Dimensions</label>
                <input
                  type="number"
                  value={config.embeddingDimensions}
                  onChange={(e) => update({ embeddingDimensions: parseInt(e.target.value) || 768 })}
                  placeholder="768"
                  className="w-full rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-indigo-500/40 focus:outline-none font-mono"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-400">
                API Key
                {config.hasEmbeddingApiKey && !config.embeddingApiKey && (
                  <span className="ml-2 text-emerald-400 font-normal">Secret exists — leave blank to keep</span>
                )}
              </label>
              <input
                type="password"
                value={config.embeddingApiKey}
                onChange={(e) => update({ embeddingApiKey: e.target.value })}
                placeholder={config.hasEmbeddingApiKey ? '••••••••' : 'Optional (for OpenAI, Voyage…)'}
                className="w-full rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-indigo-500/40 focus:outline-none font-mono"
              />
            </div>

            {/* Test endpoint button + result badge */}
            <div className="space-y-2">
              <button
                onClick={handleTestEmbedding}
                disabled={testingEmbedding || !config.embeddingUrl || !config.embeddingModel}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs font-medium text-indigo-300 transition hover:bg-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {testingEmbedding ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Testing endpoint…
                  </>
                ) : (
                  <>
                    <RotateCw className="h-3.5 w-3.5" />
                    {embeddingTestResult ? 'Re-test Endpoint' : 'Test Endpoint'}
                  </>
                )}
              </button>

              {embeddingTestResult && embeddingTestResult.success && (
                <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.08] p-3">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  <div className="text-xs">
                    <span className="font-medium text-emerald-400">Endpoint OK</span>
                    <span className="ml-2 text-gray-400">
                      {embeddingTestResult.dimensions && <>{embeddingTestResult.dimensions}d</>}
                      {embeddingTestResult.latencyMs != null && <> · {embeddingTestResult.latencyMs}ms</>}
                    </span>
                  </div>
                </div>
              )}

              {embeddingTestResult && !embeddingTestResult.success && (
                <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/[0.08] p-3">
                  <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                  <span className="text-xs font-medium text-red-400">Test failed — check URL, model, and API key</span>
                </div>
              )}

              {!embeddingTestResult && !testingEmbedding && (
                <p className="text-xs text-gray-500 italic">
                  A successful test is required before proceeding.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Claude Code CLI — detection, paths, version management, auto-update */}
      <div className="space-y-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
        {/* CLI status banner */}
        <div>
          <h3 className="text-sm font-medium text-gray-300">Claude Code CLI</h3>
          <p className="mt-1 text-xs text-gray-500">
            The chat feature requires Claude Code to be installed on this machine.
          </p>
        </div>

        {isTauri && !cliAutoChecked && (
          <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            <span className="text-xs text-gray-400">Detecting Claude Code CLI...</span>
          </div>
        )}

        {isTauri && cliAutoChecked && !cliDetected && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/[0.08] p-4">
            <div className="flex items-start gap-3">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-400">Claude Code CLI is required</p>
                <p className="mt-1 text-xs text-gray-400">
                  Install Claude Code CLI to enable the AI chat feature.
                </p>
                {installError && (
                  <p className="mt-2 rounded border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs text-red-300">
                    {installError}
                  </p>
                )}
                <button
                  onClick={() => handleInstallCli()}
                  disabled={installingCli}
                  className="mt-3 flex items-center gap-2 rounded-lg bg-red-500/20 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/30 disabled:opacity-50"
                >
                  {installingCli ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Installing via official installer...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      {installError ? 'Retry Install' : 'Install Claude Code CLI'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {isTauri && cliAutoChecked && cliDetected && (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.08] p-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-emerald-400">Claude Code CLI</span>
              {cliStatus?.installed_version && (
                <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs font-mono text-emerald-300">
                  v{cliStatus.installed_version}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Process PATH */}
        <div className="border-t border-white/[0.06] pt-4 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-xs font-medium text-gray-400">Process PATH</label>
              <p className="text-xs text-gray-500">PATH for Claude&apos;s shell commands</p>
            </div>
            <button
              onClick={handleDetectPath}
              disabled={detectingPath}
              className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50"
            >
              {detectingPath ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
              Detect
            </button>
          </div>
          <input
            value={config.chatProcessPath}
            onChange={(e) => update({ chatProcessPath: e.target.value })}
            placeholder="Inherited from system"
            className="w-full rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-indigo-500/40 focus:outline-none font-mono"
          />
          {!config.chatProcessPath && (
            <p className="text-xs text-gray-600 italic">No custom PATH — inheriting from parent process</p>
          )}
        </div>

        {/* Claude CLI Path */}
        <div className="space-y-2">
          <div>
            <label className="block text-xs font-medium text-gray-400">Claude CLI Path</label>
            <p className="text-xs text-gray-500">Explicit path to the Claude binary (optional)</p>
          </div>
          <input
            value={config.chatClaudeCliPath}
            onChange={(e) => update({ chatClaudeCliPath: e.target.value })}
            placeholder="Auto-detected"
            className="w-full rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-indigo-500/40 focus:outline-none font-mono"
          />
        </div>

        {/* CLI Version Management */}
        <div className="border-t border-white/[0.06] pt-4">
          <h4 className="text-xs font-medium text-gray-400 mb-3">CLI Version Management</h4>

          <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] px-4 py-3 space-y-2">
            {cliStatus === null ? (
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">Click to check CLI version</p>
                <button
                  onClick={handleCheckCli}
                  disabled={checkingCli}
                  className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:bg-white/[0.08] disabled:opacity-50"
                >
                  {checkingCli ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
                  Check
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${cliStatus.installed ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    <span className="text-xs text-gray-300">
                      {cliStatus.installed
                        ? <>Version <span className="font-mono text-gray-200">{cliStatus.installed_version}</span></>
                        : 'Not installed'}
                    </span>
                    {cliStatus.is_local_build && (
                      <span className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        Local build
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleCheckCli}
                    disabled={checkingCli}
                    className="p-1 rounded text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
                    title="Refresh"
                  >
                    {checkingCli ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
                  </button>
                </div>

                {cliStatus.latest_version && (
                  <p className="text-xs text-gray-500">
                    Latest: <span className="font-mono">{cliStatus.latest_version}</span>
                    {cliStatus.update_available && !cliStatus.is_local_build && (
                      <span className="ml-1.5 text-emerald-400">— Update available!</span>
                    )}
                  </p>
                )}

                {cliStatus.update_available && (
                  <button
                    onClick={() => handleInstallCli(cliStatus.latest_version ?? undefined)}
                    disabled={installingCli}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600/20 px-3 py-2 text-xs font-medium text-indigo-300 transition hover:bg-indigo-600/30 disabled:opacity-50"
                  >
                    {installingCli ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    {installingCli
                      ? 'Installing...'
                      : cliStatus.is_local_build
                        ? 'Install via npm'
                        : `Install ${cliStatus.latest_version}`}
                  </button>
                )}

                {cliStatus.cli_path && (
                  <p className="text-xs text-gray-600 font-mono truncate" title={cliStatus.cli_path}>
                    {cliStatus.cli_path}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Auto-update CLI toggle */}
        <div className="border-t border-white/[0.06] pt-4">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={config.chatAutoUpdateCli}
              onChange={(e) => update({ chatAutoUpdateCli: e.target.checked })}
              className="rounded border-white/20 bg-white/[0.04] text-indigo-500 focus:ring-indigo-500/30 focus:ring-offset-0"
            />
            <div>
              <span className="text-sm text-gray-300">Auto-update CLI on startup</span>
              <p className="text-xs text-gray-500">Keep Claude Code CLI up to date automatically</p>
            </div>
          </label>
        </div>
      </div>

      {/* MCP Server Configuration */}
      <div className="space-y-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
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
                <CheckCircle2 className="h-4 w-4" />
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
                  <Loader2 className="h-3 w-3 animate-spin" />
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

      {/* Info box */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="flex gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" />
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
