import { useAtom, useSetAtom, useAtomValue } from 'jotai'
import { useCallback, useEffect, useState } from 'react'
import { Check, Info, Loader2, RotateCw, Download } from 'lucide-react'
import { Button, Input, ProgressLine, Switch, surface } from '@/components/ui'
import { Field } from './Field'
import { StatusBanner } from './StatusBanner'
import { setupConfigAtom, chatValidAtom, trayNavigationAtom, type McpSetupStatus } from '@/atoms/setup'
import { isTauri } from '@/services/env'
import { useToast } from '@/hooks'
import { modelCatalogAtom, modelCatalogLoadedAtom } from '@/atoms'
import type { CliVersionStatus } from '@/types'
import { POLICY_TO_LEGACY_MODE, toToolPolicyMode } from '@/types/provider'
import { setupModeOptions } from '@/constants/toolPolicy'
import { setupChatEngineOptions, setupNoEngineNote } from '@/constants/setupProviders'

/** Format bytes into a human-readable string (KB, MB, GB). */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// i18n after #252 — the words of this step. Banner titles the tests read (« Claude Code CLI is required »…) stay inline.
const TEXT = {
  engine: 'Chat engine',
  modelHint: 'The model of chat sessions. It runs through the Claude Code CLI, signed in to your own account.',
  maxSessions: 'Max concurrent sessions',
  maxSessionsHint: 'How many chat sessions can run at the same time.',
  maxTurns: 'Max turns per message',
  maxTurnsHint: 'How many tool calls the assistant may chain for one message.',
  permissions: 'Permission mode',
  permissionsHint: 'Whether Claude asks for your approval before it edits files or runs shell commands.',
  embedding: 'Search by meaning',
  embeddingHint: 'A small model turns notes into vectors, so a search finds a note by its meaning and related notes link up by themselves.',
  searchModel: 'Search model',
  cliHint: 'The chat runs through Claude Code on this computer, signed in to your own Claude account. The AI itself is not included.',
  cliRequired: 'Install Claude Code to use the chat. The app runs the official installer for you; signing in to Claude is done once, in a terminal, if Claude Code asks for it.',
  mcp: 'MCP server',
  mcpHint: 'Lets Claude Code reach your projects, plans and notes from this app, as tools.',
} as const

export function ChatPage() {
  const [config, setConfig] = useAtom(setupConfigAtom)
  const setChatValid = useSetAtom(chatValidAtom)
  const isTrayNavigation = useAtomValue(trayNavigationAtom)
  const availableModels = useAtomValue(modelCatalogAtom)
  const catalogLoaded = useAtomValue(modelCatalogLoadedAtom)
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
  const [downloadProgress, setDownloadProgress] = useState<{
    downloadedBytes: number
    totalBytes: number
    percentage: number
    status: string
  } | null>(null)
  // HTTP embedding endpoint test states
  const [embeddingTestResult, setEmbeddingTestResult] = useState<{ success: boolean; dimensions?: number; latencyMs?: number } | null>(null)
  const [testingEmbedding, setTestingEmbedding] = useState(false)
  const toast = useToast()
  // Pre-existing configs have no `chatProvider`: they are Claude Code.
  const isClaude = config.chatProvider !== 'none'

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
    // No Claude Code chosen: nothing to detect, only the embedding model gates the step.
    if (!isClaude) {
      setChatValid(!isTauri || embeddingReady)
      return
    }
    if (!isTauri) {
      setChatValid(true)
      return
    }
    setChatValid(cliDetected && embeddingReady)
  }, [cliDetected, embeddingReady, isClaude, isTrayNavigation, setChatValid])

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

        // Always verify CLI status after install attempt — the install script
        // may have succeeded even if download_cli reported failure (e.g. the
        // official script installed to ~/.local/bin but post-install checks
        // didn't find it in the process PATH).
        let status: CliVersionStatus | null = null
        try {
          status = await invoke<CliVersionStatus>('check_cli_status')
        } catch {
          // check_cli_status failed — fall through to result-only logic
        }

        if (result.success || status?.installed) {
          toast.success(result.success ? result.message : 'Claude Code detected successfully')
          if (status) {
            setCliStatus(status)
            setCliDetected(status.installed)
            setConfig((prev) => ({ ...prev, claudeCodeDetected: status!.installed }))
          } else {
            setCliDetected(true)
            setConfig((prev) => ({ ...prev, claudeCodeDetected: true }))
          }
          setInstallError(null)
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
    setDownloadProgress(null)

    let unlisten: (() => void) | null = null
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const { listen } = await import('@tauri-apps/api/event')

      // Listen for progress events from the Rust backend
      unlisten = await listen<{
        downloadedBytes: number
        totalBytes: number
        percentage: number
        status: string
      }>('embedding-download-progress', (event) => {
        setDownloadProgress(event.payload)
      })

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
      unlisten?.()
      setDownloadingModel(false)
      setDownloadProgress(null)
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

  const sizeLabel = (mb: number) => (mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${mb} MB`)

  return (
    <div className="space-y-6">
      {/* Engine choice: Claude Code keeps the original path, anything else is configured later */}
      <fieldset className={`${surface} space-y-3 p-4 md:p-5`}>
        <legend className="px-1 text-sm font-semibold text-gray-200">{TEXT.engine}</legend>
        <div role="radiogroup" aria-label={TEXT.engine} className="grid gap-3 sm:grid-cols-2">
          {setupChatEngineOptions().map((opt) => {
            const selected = config.chatProvider === opt.value
            return (
              <ChoiceCard
                key={opt.value}
                role="radio"
                selected={selected}
                onClick={() => update({ chatProvider: opt.value })}
                title={opt.label}
                description={opt.description}
              />
            )
          })}
        </div>
        {!isClaude && (
          <p className="text-xs leading-4 text-gray-400" data-testid="setup-no-engine-note">
            {setupNoEngineNote()}
          </p>
        )}
      </fieldset>

      {isClaude && (<>
      {/* Model selection */}
      <div className={`${surface} space-y-5 p-4 md:p-5`}>
        <div>
          <p className="mb-3 text-sm font-semibold text-gray-200">Default Model</p>
          {availableModels.length === 0 && (
            <p className="text-xs leading-4 text-gray-500">
              {catalogLoaded
                ? 'No models available — check the backend connection.'
                : 'Loading models…'}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="Default Model">
            {availableModels.map((m) => (
              <ChoiceCard
                key={m.id}
                selected={config.chatModel === m.id}
                onClick={() => update({ chatModel: m.id })}
                title={m.fullLabel}
                description={m.description}
                tag={m.tier === 'legacy' ? 'legacy' : undefined}
              />
            ))}
          </div>
          <p className="mt-3 text-xs leading-4 text-gray-500">{TEXT.modelHint}</p>
        </div>

        {/* Max sessions */}
        <div>
          <label htmlFor="setup-max-sessions" className="mb-1.5 block text-sm font-medium text-gray-300">
            {TEXT.maxSessions}
          </label>
          <div className="flex items-center gap-4">
            <input
              id="setup-max-sessions"
              type="range"
              min={1}
              max={10}
              value={config.chatMaxSessions}
              onChange={(e) => update({ chatMaxSessions: parseInt(e.target.value) })}
              className="h-2 min-w-0 flex-1 cursor-pointer appearance-none rounded-lg bg-white/[0.1] accent-indigo-600"
            />
            <span className="w-8 text-center text-sm font-medium text-gray-100 tabular-nums">
              {config.chatMaxSessions}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-4 text-gray-500">{TEXT.maxSessionsHint}</p>
        </div>

        {/* Max turns */}
        <div>
          <label htmlFor="setup-max-turns" className="mb-1.5 block text-sm font-medium text-gray-300">
            {TEXT.maxTurns}
          </label>
          <div className="flex items-center gap-4">
            <input
              id="setup-max-turns"
              type="range"
              min={1}
              max={500}
              value={config.chatMaxTurns}
              onChange={(e) => update({ chatMaxTurns: parseInt(e.target.value) })}
              className="h-2 min-w-0 flex-1 cursor-pointer appearance-none rounded-lg bg-white/[0.1] accent-indigo-600"
            />
            <span className="w-10 text-center text-sm font-medium text-gray-100 tabular-nums">
              {config.chatMaxTurns}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-4 text-gray-500">{TEXT.maxTurnsHint}</p>
        </div>
      </div>

      {/* Permission mode */}
      <div className={`${surface} p-4 md:p-5`}>
        <p className="text-sm font-semibold text-gray-200">{TEXT.permissions}</p>
        <p className="mb-3 mt-1 text-xs leading-4 text-gray-500">{TEXT.permissionsHint}</p>
        <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label={TEXT.permissions}>
          {setupModeOptions().map((m) => {
            // The config file keeps the legacy Claude string: the desktop (Rust) reads it.
            const selected = toToolPolicyMode(config.chatPermissionMode) === m.mode
            return (
              <ChoiceCard
                key={m.mode}
                selected={selected}
                onClick={() => update({ chatPermissionMode: POLICY_TO_LEGACY_MODE[m.mode] })}
                title={m.label}
                description={m.description}
              />
            )
          })}
        </div>
      </div>

      </>)}

      {/* Embedding Provider */}
      <div className={`${surface} space-y-4 p-4 md:p-5`}>
        <div>
          <h3 className="text-sm font-semibold text-gray-200">{TEXT.embedding}</h3>
          <p className="mt-1 text-xs leading-4 text-gray-500">{TEXT.embeddingHint}</p>
        </div>

        {/* Provider selection */}
        <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label={TEXT.embedding}>
          {([
            { value: 'local' as const, label: 'On this computer', description: 'The search model runs here (fastembed, ONNX). Nothing leaves your computer.' },
            { value: 'http' as const, label: 'HTTP API', description: 'An OpenAI-compatible endpoint (Ollama, OpenAI, vLLM…).' },
            { value: 'disabled' as const, label: 'Off', description: 'No search by meaning.' },
          ]).map((p) => (
            <ChoiceCard
              key={p.value}
              selected={config.embeddingProvider === p.value}
              onClick={() => update({ embeddingProvider: p.value })}
              title={p.label}
              description={p.description}
            />
          ))}
        </div>

        {/* Local model picker */}
        {config.embeddingProvider === 'local' && (
          <div className="space-y-3 border-t border-white/[0.06] pt-4">
            <div>
              <label htmlFor="setup-fastembed-model" className="mb-1 block text-sm font-medium text-gray-300">
                {TEXT.searchModel}
              </label>
              {/* Native select: the `Select` primitive has no option groups (reported) */}
              <select
                id="setup-fastembed-model"
                value={config.embeddingFastembedModel}
                onChange={(e) => update({ embeddingFastembedModel: e.target.value })}
                className="w-full rounded-lg border border-border-default bg-surface-base px-3 py-2 text-base text-gray-100 input-focus-glow md:text-sm"
              >
                <optgroup label="Multilingual (recommended)">
                  <option value="multilingual-e5-base">multilingual-e5-base (768d, ~1.1 GB)</option>
                  <option value="multilingual-e5-small">multilingual-e5-small (384d, ~500 MB)</option>
                  <option value="multilingual-e5-large">multilingual-e5-large (1024d, ~2.3 GB)</option>
                </optgroup>
                <optgroup label="English only">
                  <option value="bge-small-en-v1.5">bge-small-en-v1.5 (384d, ~150 MB)</option>
                  <option value="bge-base-en-v1.5">bge-base-en-v1.5 (768d, ~450 MB)</option>
                  <option value="all-minilm-l6-v2">all-MiniLM-L6-v2 (384d, ~100 MB)</option>
                  <option value="nomic-embed-text-v1.5">nomic-embed-text-v1.5 (768d, ~550 MB)</option>
                  <option value="gte-base-en-v1.5">gte-base-en-v1.5 (768d, ~550 MB)</option>
                </optgroup>
                <optgroup label="Large / High-quality">
                  <option value="bge-m3">bge-m3 (1024d, multilingual)</option>
                  <option value="bge-large-en-v1.5">bge-large-en-v1.5 (1024d)</option>
                  <option value="snowflake-arctic-embed-l">snowflake-arctic-embed-l (1024d)</option>
                </optgroup>
              </select>
              <p className="mt-1 text-xs leading-4 text-gray-500">
                Default: <span className="font-mono">multilingual-e5-base</span>, French and English, 768 dimensions.
              </p>
            </div>

            {/* Model availability status */}
            {isTauri && !embeddingModelChecked && (
              <StatusBanner
                tone="neutral"
                title="Checking the model cache…"
                role="status"
                icon={<Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-gray-400" aria-hidden="true" />}
              />
            )}

            {isTauri && embeddingModelChecked && embeddingModelAvailable && (
              <StatusBanner tone="success" title="Search model downloaded and ready" role="status" />
            )}

            {isTauri && embeddingModelChecked && !embeddingModelAvailable && (
              <StatusBanner
                tone="warning"
                title="The search model is not downloaded yet"
                role="status"
                action={
                  !downloadingModel && (
                    <Button variant="secondary" size="sm" onClick={handleDownloadModel}>
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      {downloadError
                        ? 'Retry download'
                        : `Download the model${embeddingEstimatedSize > 0 ? ` (~${sizeLabel(embeddingEstimatedSize)})` : ''}`}
                    </Button>
                  )
                }
              >
                <p>
                  It is downloaded once; search by meaning works without it only after that.
                  {embeddingEstimatedSize > 0 && <span className="ml-1 text-gray-500">About {sizeLabel(embeddingEstimatedSize)}.</span>}
                </p>
                {downloadError && (
                  <p role="alert" className="break-words text-xs leading-4 text-red-300">
                    {downloadError}
                  </p>
                )}
                {downloadingModel && (
                  <div className="space-y-1.5">
                    {downloadProgress && downloadProgress.totalBytes > 0 ? (
                      <>
                        <ProgressLine value={downloadProgress.percentage} label="Model download" size="md" />
                        <p className="flex justify-between text-xs leading-4 text-gray-400 tabular-nums">
                          <span>{formatBytes(downloadProgress.downloadedBytes)} / {formatBytes(downloadProgress.totalBytes)}</span>
                          <span>{Math.min(100, downloadProgress.percentage).toFixed(0)}%</span>
                        </p>
                      </>
                    ) : (
                      <p className="flex items-center gap-2 text-xs leading-4 text-gray-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        {downloadProgress && downloadProgress.downloadedBytes > 0
                          ? `${formatBytes(downloadProgress.downloadedBytes)} downloaded…`
                          : 'Preparing the download…'}
                      </p>
                    )}
                  </div>
                )}
              </StatusBanner>
            )}
          </div>
        )}

        {/* HTTP provider settings */}
        {config.embeddingProvider === 'http' && (
          <div className="space-y-3 border-t border-white/[0.06] pt-4">
            <Field
              label="Endpoint URL"
              value={config.embeddingUrl}
              onChange={(v) => update({ embeddingUrl: v })}
              placeholder="http://localhost:11434/v1/embeddings"
              mono
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Model" value={config.embeddingModel} onChange={(v) => update({ embeddingModel: v })} placeholder="nomic-embed-text" mono />
              <Field
                label="Dimensions"
                type="number"
                value={String(config.embeddingDimensions)}
                onChange={(v) => update({ embeddingDimensions: parseInt(v) || 768 })}
                placeholder="768"
                mono
              />
            </div>
            <Field
              label="API key"
              type="password"
              value={config.embeddingApiKey}
              onChange={(v) => update({ embeddingApiKey: v })}
              placeholder={config.hasEmbeddingApiKey ? '••••••••' : 'Optional (for OpenAI, Voyage…)'}
              hint={config.hasEmbeddingApiKey && !config.embeddingApiKey ? 'A key is already configured — leave blank to keep it' : undefined}
              mono
            />

            {/* Test endpoint button + result */}
            <div className="space-y-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleTestEmbedding}
                disabled={testingEmbedding || !config.embeddingUrl || !config.embeddingModel}
              >
                {testingEmbedding ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    Testing endpoint…
                  </>
                ) : (
                  <>
                    <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                    {embeddingTestResult ? 'Re-test endpoint' : 'Test endpoint'}
                  </>
                )}
              </Button>

              {embeddingTestResult && embeddingTestResult.success && (
                <StatusBanner tone="success" title="Endpoint OK" role="status">
                  <p className="tabular-nums">
                    {embeddingTestResult.dimensions && <>{embeddingTestResult.dimensions} dimensions</>}
                    {embeddingTestResult.latencyMs != null && <> · {embeddingTestResult.latencyMs} ms</>}
                  </p>
                </StatusBanner>
              )}

              {embeddingTestResult && !embeddingTestResult.success && (
                <StatusBanner tone="danger" title="Test failed" role="alert">
                  <p>Check the URL, the model name and the API key.</p>
                </StatusBanner>
              )}

              {!embeddingTestResult && !testingEmbedding && (
                <p className="text-xs leading-4 text-gray-500">A successful test is required before continuing.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {isClaude && (<>
      {/* Claude Code CLI — detection, paths, version management, auto-update */}
      <div className={`${surface} space-y-4 p-4 md:p-5`}>
        {/* CLI status banner */}
        <div>
          <h3 className="text-sm font-semibold text-gray-200">Claude Code CLI</h3>
          <p className="mt-1 text-xs leading-4 text-gray-500">{TEXT.cliHint}</p>
        </div>

        {isTauri && !cliAutoChecked && (
          <StatusBanner
            tone="neutral"
            title="Detecting Claude Code CLI..."
            role="status"
            icon={<Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-gray-400" aria-hidden="true" />}
          />
        )}

        {isTauri && cliAutoChecked && !cliDetected && (
          <StatusBanner
            tone="danger"
            title="Claude Code CLI is required"
            role="alert"
            action={
              <Button variant="secondary" size="sm" onClick={() => handleInstallCli()} disabled={installingCli}>
                {installingCli ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Installing via the official installer...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" aria-hidden="true" />
                    {installError ? 'Retry Install' : 'Install Claude Code CLI'}
                  </>
                )}
              </Button>
            }
          >
            <p>{TEXT.cliRequired}</p>
            {installError && (
              <p className="break-words text-xs leading-4 text-red-300">{installError}</p>
            )}
          </StatusBanner>
        )}

        {isTauri && cliAutoChecked && cliDetected && (
          <StatusBanner tone="success" title="Claude Code CLI is installed" role="status">
            {cliStatus?.installed_version && (
              <p className="font-mono text-xs leading-4 text-gray-400">v{cliStatus.installed_version}</p>
            )}
          </StatusBanner>
        )}

        {/* Process PATH */}
        <div className="space-y-2 border-t border-white/[0.06] pt-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 basis-56">
              <Input
                label="Process PATH"
                value={config.chatProcessPath}
                onChange={(e) => update({ chatProcessPath: e.target.value })}
                placeholder="Inherited from system"
                className="font-mono"
              />
            </div>
            <Button variant="secondary" size="sm" flat onClick={handleDetectPath} disabled={detectingPath} className="mb-px">
              {detectingPath ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />}
              Detect
            </Button>
          </div>
          <p className="text-xs leading-4 text-gray-500">
            {config.chatProcessPath ? 'The PATH Claude’s shell commands run with.' : 'No custom PATH: Claude’s shell commands inherit the app’s.'}
          </p>
        </div>

        {/* Claude CLI Path */}
        <Field
          label="Claude CLI path"
          value={config.chatClaudeCliPath}
          onChange={(v) => update({ chatClaudeCliPath: v })}
          placeholder="Auto-detected"
          hint="Explicit path to the Claude binary (optional)."
          mono
        />

        {/* CLI Version Management */}
        <div className="border-t border-white/[0.06] pt-4">
          <h4 className="mb-2 text-sm font-medium text-gray-300">CLI version</h4>

          <div className="space-y-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            {cliStatus === null ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs leading-4 text-gray-500">Check which version is installed.</p>
                <Button variant="secondary" size="sm" flat onClick={handleCheckCli} disabled={checkingCli}>
                  {checkingCli ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />}
                  Check
                </Button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${cliStatus.installed ? 'bg-emerald-400' : 'bg-red-400'}`} aria-hidden="true" />
                    <span className="text-xs leading-4 text-gray-300">
                      {cliStatus.installed
                        ? <>Version <span className="font-mono text-gray-200">{cliStatus.installed_version}</span></>
                        : 'Not installed'}
                    </span>
                    {cliStatus.is_local_build && (
                      <span className="rounded border border-white/[0.08] px-1.5 text-[11px] text-gray-400">Local build</span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    flat
                    onClick={handleCheckCli}
                    disabled={checkingCli}
                    aria-label="Check the CLI version again"
                    title="Check again"
                    className="btn-icon size-9 p-0! md:size-8"
                  >
                    {checkingCli ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />}
                  </Button>
                </div>

                {cliStatus.latest_version && (
                  <p className="text-xs leading-4 text-gray-500">
                    Latest: <span className="font-mono">{cliStatus.latest_version}</span>
                    {cliStatus.update_available && !cliStatus.is_local_build && (
                      <span className="ml-1.5 text-emerald-400">— an update is available</span>
                    )}
                  </p>
                )}

                {cliStatus.update_available && (
                  <Button variant="secondary" size="sm" flat onClick={() => handleInstallCli(cliStatus.latest_version ?? undefined)} disabled={installingCli}>
                    {installingCli ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Download className="h-3.5 w-3.5" aria-hidden="true" />}
                    {installingCli
                      ? 'Installing...'
                      : cliStatus.is_local_build
                        ? 'Install via npm'
                        : `Install ${cliStatus.latest_version}`}
                  </Button>
                )}

                {cliStatus.cli_path && (
                  <p className="truncate font-mono text-xs leading-4 text-gray-500" title={cliStatus.cli_path}>
                    {cliStatus.cli_path}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Auto-update CLI toggle */}
        <div className="border-t border-white/[0.06] pt-4">
          <Switch
            checked={config.chatAutoUpdateCli}
            onChange={(checked) => update({ chatAutoUpdateCli: checked })}
            label={
              <span className="block min-w-0 text-sm">
                <span className="block font-medium text-gray-200">Update Claude Code when the app starts</span>
                <span className="mt-0.5 block text-xs leading-4 text-gray-500">Keeps the CLI at its latest version for you.</span>
              </span>
            }
          />
        </div>
      </div>

      {/* MCP Server Configuration */}
      <div className={`${surface} space-y-3 p-4 md:p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-56">
            <h3 className="text-sm font-semibold text-gray-200">{TEXT.mcp}</h3>
            <p className="mt-1 text-xs leading-4 text-gray-500">{TEXT.mcpHint}</p>
          </div>
          <div className="flex items-center gap-2">
            {mcpSuccess && (
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-400">
                <Check className="h-4 w-4" aria-hidden="true" />
                {config.mcpSetupStatus === 'already_configured' ? 'Already configured' : 'Configured'}
              </span>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleConfigureMcp}
              disabled={config.mcpSetupStatus === 'configuring' || mcpSuccess}
            >
              {config.mcpSetupStatus === 'configuring' ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Configuring…
                </>
              ) : (
                'Configure MCP'
              )}
            </Button>
          </div>
        </div>

        {/* Status message */}
        {config.mcpSetupStatus === 'error' && (
          <StatusBanner tone="danger" title="MCP configuration failed" role="alert">
            <p className="break-words">{config.mcpSetupMessage}</p>
          </StatusBanner>
        )}
        {mcpSuccess && config.mcpSetupMessage && (
          <p className="text-xs leading-4 text-gray-400">{config.mcpSetupMessage}</p>
        )}
      </div>

      </>)}

      {/* Info box */}
      <div className={`${surface} flex gap-3 p-4`}>
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" aria-hidden="true" />
        <p className="min-w-0 text-xs leading-relaxed text-gray-500">
          These settings can be changed at any time in{' '}
          <code className="rounded bg-white/[0.06] px-1 py-0.5 text-gray-400">config.yaml</code>
          . If you don&apos;t use the chat, you can skip this step. The MCP server can also be configured later by running{' '}
          <code className="rounded bg-white/[0.06] px-1 py-0.5 text-gray-400">orchestrator setup-claude</code>.
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// ChoiceCard — one option of an exclusive choice (model, mode, provider)
// ============================================================================

/**
 * An option in a grid of exclusive choices: an opaque surface (content, not a
 * button in the glass sense), the chosen one says so with a glyph and
 * `aria-pressed` / `aria-checked`, never with colour alone.
 */
function ChoiceCard({
  selected,
  onClick,
  title,
  description,
  tag,
  role,
}: {
  selected: boolean
  onClick: () => void
  title: string
  description?: string
  /** A short qualifier after the title (« legacy »). */
  tag?: string
  /** `radio` inside a `radiogroup` (then `aria-checked`), otherwise a toggle button (`aria-pressed`). */
  role?: 'radio'
}) {
  const ariaState = role === 'radio' ? { 'aria-checked': selected } : { 'aria-pressed': selected }
  return (
    <button
      type="button"
      role={role}
      onClick={onClick}
      {...ariaState}
      className={`flex min-w-0 flex-col items-start gap-1.5 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/60 ${
        selected
          ? 'border-indigo-500/50 bg-indigo-500/10'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]'
      }`}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className={`min-w-0 break-words text-sm font-medium ${selected ? 'text-gray-50' : 'text-gray-200'}`}>
          {title}
          {tag && <span className="ml-1.5 rounded border border-white/[0.08] px-1.5 text-[11px] font-normal text-gray-400">{tag}</span>}
        </span>
        {selected && <Check className="h-4 w-4 shrink-0 text-indigo-300" aria-hidden="true" />}
      </span>
      {description && <span className="text-xs leading-4 text-gray-500">{description}</span>}
    </button>
  )
}
