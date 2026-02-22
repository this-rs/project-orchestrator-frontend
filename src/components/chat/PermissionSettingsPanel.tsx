import { useState, useEffect, useCallback, useRef } from 'react'
import { useAtom } from 'jotai'
import { chatPermissionConfigAtom } from '@/atoms'
import { chatApi } from '@/services/chat'
import { useToast } from '@/hooks'
import { isTauri } from '@/services/env'
import type { PermissionMode, CliVersionStatus } from '@/types'
import { X, Settings, Loader2, RotateCw, Download, Terminal, FolderCog } from 'lucide-react'

// ---------------------------------------------------------------------------
// Mode metadata
// ---------------------------------------------------------------------------

interface ModeInfo {
  mode: PermissionMode
  label: string
  description: string
  color: string // Tailwind color for the active dot/border
  bgActive: string // Active background
}

const MODES: ModeInfo[] = [
  {
    mode: 'bypassPermissions',
    label: 'Bypass',
    description: 'Auto-approve all tools. No prompts.',
    color: 'emerald',
    bgActive: 'bg-emerald-500/10 border-emerald-500/40',
  },
  {
    mode: 'acceptEdits',
    label: 'Accept Edits',
    description: 'Auto-approve file edits, prompt for commands.',
    color: 'blue',
    bgActive: 'bg-blue-500/10 border-blue-500/40',
  },
  {
    mode: 'default',
    label: 'Default',
    description: 'Prompt for all tool usage.',
    color: 'amber',
    bgActive: 'bg-amber-500/10 border-amber-500/40',
  },
  {
    mode: 'plan',
    label: 'Plan Only',
    description: 'Read-only mode. No writes or commands.',
    color: 'gray',
    bgActive: 'bg-gray-500/10 border-gray-400/40',
  },
]

// ---------------------------------------------------------------------------
// Tool pattern presets
// ---------------------------------------------------------------------------

interface ToolPreset {
  label: string
  patterns: string[]
}

const ALLOWED_PRESETS: ToolPreset[] = [
  { label: 'MCP tools', patterns: ['mcp__project-orchestrator__*'] },
  { label: 'Git commands', patterns: ['Bash(git *)'] },
  { label: 'Cargo commands', patterns: ['Bash(cargo *)'] },
  { label: 'npm commands', patterns: ['Bash(npm *)'] },
  { label: 'Read files', patterns: ['Read'] },
  { label: 'Edit files', patterns: ['Edit'] },
  { label: 'Web search', patterns: ['WebSearch'] },
]

const DISALLOWED_PRESETS: ToolPreset[] = [
  { label: 'Destructive rm', patterns: ['Bash(rm -rf *)'] },
  { label: 'Sudo commands', patterns: ['Bash(sudo *)'] },
  { label: 'Curl commands', patterns: ['Bash(curl *)'] },
  { label: 'Env files', patterns: ['Read(.env*)'] },
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PatternChip({ value, onRemove, danger }: { value: string; onRemove: () => void; danger?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono ${
        danger
          ? 'bg-red-500/10 text-red-300 border border-red-500/20'
          : 'bg-white/[0.06] text-gray-300 border border-white/[0.06]'
      }`}
    >
      {value}
      <button
        onClick={onRemove}
        className="ml-0.5 hover:text-white transition-colors"
        title="Remove"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  )
}

function PatternListEditor({
  label,
  description,
  patterns,
  onChange,
  presets,
  danger,
}: {
  label: string
  description: string
  patterns: string[]
  onChange: (patterns: string[]) => void
  presets: ToolPreset[]
  danger?: boolean
}) {
  const [input, setInput] = useState('')
  const [showPresets, setShowPresets] = useState(false)
  const presetsRef = useRef<HTMLDivElement>(null)

  // Close presets on outside click
  useEffect(() => {
    if (!showPresets) return
    const handler = (e: MouseEvent) => {
      if (presetsRef.current && !presetsRef.current.contains(e.target as Node)) {
        setShowPresets(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPresets])

  const addPattern = (pattern: string) => {
    const trimmed = pattern.trim()
    if (trimmed && !patterns.includes(trimmed)) {
      onChange([...patterns, trimmed])
    }
    setInput('')
  }

  const addPreset = (preset: ToolPreset) => {
    const newPatterns = preset.patterns.filter((p) => !patterns.includes(p))
    if (newPatterns.length > 0) {
      onChange([...patterns, ...newPatterns])
    }
    setShowPresets(false)
  }

  const removePattern = (pattern: string) => {
    onChange(patterns.filter((p) => p !== pattern))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <h4 className={`text-xs font-medium ${danger ? 'text-red-400' : 'text-gray-300'}`}>{label}</h4>
          <p className="text-[10px] text-gray-500">{description}</p>
        </div>
        <div className="relative" ref={presetsRef}>
          <button
            onClick={() => setShowPresets(!showPresets)}
            className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            + Presets
          </button>
          {showPresets && (
            <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-surface-popover border border-white/[0.08] rounded-lg shadow-xl py-1">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => addPreset(preset)}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-white/[0.04] transition-colors"
                >
                  {preset.label}
                  <span className="block text-[10px] text-gray-500 font-mono">{preset.patterns.join(', ')}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Current patterns */}
      {patterns.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {patterns.map((p) => (
            <PatternChip key={p} value={p} onRemove={() => removePattern(p)} danger={danger} />
          ))}
        </div>
      )}

      {/* Add new pattern */}
      <div className="flex gap-1.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addPattern(input)
            }
          }}
          placeholder="e.g. Bash(git *)"
          className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/40 font-mono"
        />
        <button
          onClick={() => addPattern(input)}
          disabled={!input.trim()}
          className="px-2 py-1 rounded text-xs bg-white/[0.06] text-gray-400 hover:text-gray-200 hover:bg-white/[0.08] transition-colors disabled:opacity-30"
        >
          Add
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

interface PermissionSettingsPanelProps {
  /** Close handler. When omitted, the panel renders without a header (standalone mode for Settings page). */
  onClose?: () => void
}

export function PermissionSettingsPanel({ onClose }: PermissionSettingsPanelProps) {
  const [serverConfig, setServerConfig] = useAtom(chatPermissionConfigAtom)
  const toast = useToast()

  // Local working copy — permissions
  const [localMode, setLocalMode] = useState<PermissionMode>('bypassPermissions')
  const [localAllowed, setLocalAllowed] = useState<string[]>([])
  const [localDisallowed, setLocalDisallowed] = useState<string[]>([])

  // Local working copy — environment
  const [localProcessPath, setLocalProcessPath] = useState('')
  const [localCliPath, setLocalCliPath] = useState('')
  const [localAutoUpdate, setLocalAutoUpdate] = useState(false)
  const [localAutoUpdateApp, setLocalAutoUpdateApp] = useState(true)
  const [serverProcessPath, setServerProcessPath] = useState<string | null>(null)
  const [serverCliPath, setServerCliPath] = useState<string | null>(null)
  const [serverAutoUpdate, setServerAutoUpdate] = useState(false)
  const [serverAutoUpdateApp, setServerAutoUpdateApp] = useState(true)

  // UI state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detecting, setDetecting] = useState(false)

  // CLI version state
  const [cliStatus, setCliStatus] = useState<CliVersionStatus | null>(null)
  const [checkingCli, setCheckingCli] = useState(false)
  const [installingCli, setInstallingCli] = useState(false)

  // Fetch config on mount — try unified endpoint, fallback to permissions-only
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError(null)

        // Try the unified chat config endpoint first (includes env fields)
        // Falls back to permissions-only endpoint if the backend doesn't support it yet
        let permMode: PermissionMode = 'bypassPermissions'
        let allowedTools: string[] = []
        let disallowedTools: string[] = []
        let defaultModel: string | undefined
        let processPath: string | null = null
        let cliPath: string | null = null
        let autoUpdate = false
        let autoUpdateApp = true

        try {
          const config = await chatApi.getChatConfig()
          permMode = config.mode
          allowedTools = config.allowed_tools ?? []
          disallowedTools = config.disallowed_tools ?? []
          defaultModel = config.default_model
          processPath = config.process_path
          cliPath = config.claude_cli_path
          autoUpdate = config.auto_update_cli
          autoUpdateApp = config.auto_update_app
        } catch {
          // Unified endpoint not available — fallback to legacy permissions endpoint
          const perm = await chatApi.getPermissionConfig()
          permMode = perm.mode
          allowedTools = perm.allowed_tools ?? []
          disallowedTools = perm.disallowed_tools ?? []
          defaultModel = perm.default_model
        }

        if (cancelled) return

        // Update permission atom
        setServerConfig({
          mode: permMode,
          allowed_tools: allowedTools,
          disallowed_tools: disallowedTools,
          default_model: defaultModel,
        })
        // Local permission state
        setLocalMode(permMode)
        setLocalAllowed([...allowedTools])
        setLocalDisallowed([...disallowedTools])
        // Local env state
        setLocalProcessPath(processPath ?? '')
        setLocalCliPath(cliPath ?? '')
        setLocalAutoUpdate(autoUpdate)
        setLocalAutoUpdateApp(autoUpdateApp)
        // Server snapshots for change detection
        setServerProcessPath(processPath)
        setServerCliPath(cliPath)
        setServerAutoUpdate(autoUpdate)
        setServerAutoUpdateApp(autoUpdateApp)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load chat config')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [setServerConfig])

  // Detect unsaved changes (permissions + env)
  const hasPermChanges =
    serverConfig !== null &&
    (localMode !== serverConfig.mode ||
      JSON.stringify(localAllowed) !== JSON.stringify(serverConfig.allowed_tools) ||
      JSON.stringify(localDisallowed) !== JSON.stringify(serverConfig.disallowed_tools))

  const hasEnvChanges =
    (localProcessPath || null) !== (serverProcessPath || null) ||
    (localCliPath || null) !== (serverCliPath || null) ||
    localAutoUpdate !== serverAutoUpdate ||
    localAutoUpdateApp !== serverAutoUpdateApp

  const hasChanges = hasPermChanges || hasEnvChanges

  const handleSave = useCallback(async () => {
    try {
      setSaving(true)
      // Try the unified PATCH endpoint first, fallback to permissions-only PUT
      try {
        const saved = await chatApi.updateChatConfig({
          mode: localMode,
          allowed_tools: localAllowed,
          disallowed_tools: localDisallowed,
          process_path: localProcessPath || null,
          claude_cli_path: localCliPath || null,
          auto_update_cli: localAutoUpdate,
          auto_update_app: localAutoUpdateApp,
        })
        // Update atoms and server snapshots
        setServerConfig({
          mode: saved.mode,
          allowed_tools: saved.allowed_tools,
          disallowed_tools: saved.disallowed_tools,
          default_model: saved.default_model,
        })
        setServerProcessPath(saved.process_path)
        setServerCliPath(saved.claude_cli_path)
        setServerAutoUpdate(saved.auto_update_cli)
        setServerAutoUpdateApp(saved.auto_update_app)
      } catch {
        // Unified endpoint not available — fallback to permissions-only
        const saved = await chatApi.updatePermissionConfig({
          mode: localMode,
          allowed_tools: localAllowed,
          disallowed_tools: localDisallowed,
        })
        setServerConfig({
          mode: saved.mode,
          allowed_tools: saved.allowed_tools,
          disallowed_tools: saved.disallowed_tools,
          default_model: saved.default_model,
        })
      }
      toast.success('Settings saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }, [localMode, localAllowed, localDisallowed, localProcessPath, localCliPath, localAutoUpdate, localAutoUpdateApp, setServerConfig, toast])

  const handleCancel = () => {
    if (serverConfig) {
      setLocalMode(serverConfig.mode)
      setLocalAllowed([...(serverConfig.allowed_tools ?? [])])
      setLocalDisallowed([...(serverConfig.disallowed_tools ?? [])])
    }
    setLocalProcessPath(serverProcessPath ?? '')
    setLocalCliPath(serverCliPath ?? '')
    setLocalAutoUpdate(serverAutoUpdate)
    setLocalAutoUpdateApp(serverAutoUpdateApp)
  }

  const handleDetectPath = async () => {
    try {
      setDetecting(true)
      // Prefer Tauri invoke (works even before backend starts, e.g. in setup wizard)
      if (isTauri) {
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          const path = await invoke<string | null>('detect_shell_path')
          if (path) {
            setLocalProcessPath(path)
            toast.success('PATH detected from login shell')
            return
          }
        } catch {
          // Tauri invoke failed — fall through to REST endpoint
        }
      }
      // Fallback: REST endpoint
      const res = await chatApi.detectPath()
      if (res.path) {
        setLocalProcessPath(res.path)
        toast.success('PATH detected from login shell')
      } else {
        toast.error(res.error ?? 'Could not detect PATH')
      }
    } catch {
      toast.error('Failed to detect PATH')
    } finally {
      setDetecting(false)
    }
  }

  const handleCheckCli = async () => {
    try {
      setCheckingCli(true)
      const status = await chatApi.getCliStatus()
      setCliStatus(status)
    } catch {
      toast.error('Failed to check CLI status')
    } finally {
      setCheckingCli(false)
    }
  }

  const handleInstallCli = async (version?: string) => {
    try {
      setInstallingCli(true)
      const result = await chatApi.installCli(version)
      if (result.success) {
        toast.success(result.message)
        // Refresh status after install
        const status = await chatApi.getCliStatus()
        setCliStatus(status)
      } else {
        toast.error(result.message)
      }
    } catch {
      toast.error('Failed to install CLI')
    } finally {
      setInstallingCli(false)
    }
  }

  // Mode color dot for the active mode
  const activeModeInfo = MODES.find((m) => m.mode === localMode)

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Panel header — shown only in embedded/panel mode (onClose provided) */}
      {onClose && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-300">Permission Settings</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition-colors"
            title="Close settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* --- Permission mode selector --- */}
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Permission Mode</h3>
              <div className="grid grid-cols-2 gap-2">
                {MODES.map((m) => {
                  const isActive = localMode === m.mode
                  const dotColor = {
                    emerald: 'bg-emerald-400',
                    blue: 'bg-blue-400',
                    amber: 'bg-amber-400',
                    gray: 'bg-gray-400',
                  }[m.color]

                  return (
                    <button
                      key={m.mode}
                      onClick={() => setLocalMode(m.mode)}
                      className={`text-left rounded-lg border p-2.5 transition-all ${
                        isActive
                          ? m.bgActive
                          : 'border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.02]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? dotColor : 'bg-gray-600'}`} />
                        <span className={`text-xs font-medium ${isActive ? 'text-gray-100' : 'text-gray-400'}`}>
                          {m.label}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 leading-tight">{m.description}</p>
                    </button>
                  )
                })}
              </div>
            </section>

            {/* --- Allowed tools --- */}
            <section>
              <PatternListEditor
                label="Allowed Tools"
                description="Tool patterns to auto-approve"
                patterns={localAllowed}
                onChange={setLocalAllowed}
                presets={ALLOWED_PRESETS}
              />
            </section>

            {/* --- Disallowed tools --- */}
            <section>
              <PatternListEditor
                label="Disallowed Tools"
                description="Tool patterns to always block"
                patterns={localDisallowed}
                onChange={setLocalDisallowed}
                presets={DISALLOWED_PRESETS}
                danger
              />
            </section>

            {/* --- Environment --- */}
            <section className="space-y-3">
              <div className="flex items-center gap-1.5">
                <FolderCog className="w-3.5 h-3.5 text-gray-400" />
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Environment</h3>
              </div>

              {/* Process PATH */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-medium text-gray-300">Process PATH</h4>
                    <p className="text-[10px] text-gray-500">PATH for Claude&apos;s shell commands</p>
                  </div>
                  <button
                    onClick={handleDetectPath}
                    disabled={detecting}
                    className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50"
                  >
                    {detecting ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RotateCw className="w-3 h-3" />
                    )}
                    Detect
                  </button>
                </div>
                <input
                  value={localProcessPath}
                  onChange={(e) => setLocalProcessPath(e.target.value)}
                  placeholder="Inherited from system"
                  className="w-full bg-white/[0.04] border border-white/[0.06] rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/40 font-mono"
                />
                {!localProcessPath && (
                  <p className="text-[10px] text-gray-600 italic">No custom PATH — inheriting from parent process</p>
                )}
              </div>

              {/* Claude CLI Path */}
              <div className="space-y-1.5">
                <div>
                  <h4 className="text-xs font-medium text-gray-300">Claude CLI Path</h4>
                  <p className="text-[10px] text-gray-500">Explicit path to the Claude binary (optional)</p>
                </div>
                <input
                  value={localCliPath}
                  onChange={(e) => setLocalCliPath(e.target.value)}
                  placeholder="Auto-detected"
                  className="w-full bg-white/[0.04] border border-white/[0.06] rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/40 font-mono"
                />
              </div>
            </section>

            {/* --- Claude Code CLI --- */}
            <section className="space-y-3">
              <div className="flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-gray-400" />
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Claude Code CLI</h3>
              </div>

              {/* CLI Status */}
              <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] px-3 py-2.5 space-y-2">
                {cliStatus === null ? (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">Click to check CLI version</p>
                    <button
                      onClick={handleCheckCli}
                      disabled={checkingCli}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-white/[0.06] text-gray-400 hover:text-gray-200 hover:bg-white/[0.08] transition-colors disabled:opacity-50"
                    >
                      {checkingCli ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
                      Check
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${cliStatus.installed ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        <span className="text-xs text-gray-300">
                          {cliStatus.installed
                            ? <>Version <span className="font-mono text-gray-200">{cliStatus.installed_version}</span></>
                            : 'Not installed'}
                        </span>
                        {cliStatus.is_local_build && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
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
                        {checkingCli ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
                      </button>
                    </div>

                    {cliStatus.latest_version && (
                      <p className="text-[10px] text-gray-500">
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
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 transition-colors disabled:opacity-50 w-full justify-center"
                      >
                        {installingCli ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        {installingCli
                          ? 'Installing...'
                          : cliStatus.is_local_build
                            ? 'Install via npm'
                            : `Install ${cliStatus.latest_version}`}
                      </button>
                    )}

                    {cliStatus.cli_path && (
                      <p className="text-[10px] text-gray-600 font-mono truncate" title={cliStatus.cli_path}>
                        {cliStatus.cli_path}
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Auto-update toggles */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={localAutoUpdateApp}
                    onChange={(e) => setLocalAutoUpdateApp(e.target.checked)}
                    className="rounded border-white/20 bg-white/[0.04] text-indigo-500 focus:ring-indigo-500/30 focus:ring-offset-0"
                  />
                  Auto-update application on startup
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={localAutoUpdate}
                    onChange={(e) => setLocalAutoUpdate(e.target.checked)}
                    className="rounded border-white/20 bg-white/[0.04] text-indigo-500 focus:ring-indigo-500/30 focus:ring-offset-0"
                  />
                  Auto-update CLI on startup
                </label>
              </div>
            </section>

            {/* Current mode summary */}
            {activeModeInfo && (
              <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] px-3 py-2">
                <p className="text-[10px] text-gray-500">
                  <span className="font-medium text-gray-400">Active:</span>{' '}
                  {activeModeInfo.label} &mdash; {activeModeInfo.description}
                  {localAllowed.length > 0 && (
                    <> &middot; {localAllowed.length} allowed pattern{localAllowed.length > 1 ? 's' : ''}</>
                  )}
                  {localDisallowed.length > 0 && (
                    <> &middot; {localDisallowed.length} blocked pattern{localDisallowed.length > 1 ? 's' : ''}</>
                  )}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer — Save / Cancel */}
      {!loading && !error && (
        <div className="px-4 py-3 border-t border-white/[0.06] flex items-center justify-end gap-2 shrink-0">
          {hasChanges && (
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 rounded-md text-xs text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 transition-colors disabled:opacity-30"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}
