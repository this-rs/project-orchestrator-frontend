import { useState, useEffect, useCallback, useRef } from 'react'
import { useAtom } from 'jotai'
import { chatPermissionConfigAtom } from '@/atoms'
import { chatApi } from '@/services/chat'
import { useToast } from '@/hooks'
import type { PermissionMode, PermissionConfig } from '@/types'
import { X, Settings, Loader2 } from 'lucide-react'

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
  onClose: () => void
}

export function PermissionSettingsPanel({ onClose }: PermissionSettingsPanelProps) {
  const [serverConfig, setServerConfig] = useAtom(chatPermissionConfigAtom)
  const toast = useToast()

  // Local working copy
  const [localMode, setLocalMode] = useState<PermissionMode>('bypassPermissions')
  const [localAllowed, setLocalAllowed] = useState<string[]>([])
  const [localDisallowed, setLocalDisallowed] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch config on mount
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const config = await chatApi.getPermissionConfig()
        if (cancelled) return
        setServerConfig(config)
        setLocalMode(config.mode)
        setLocalAllowed([...(config.allowed_tools ?? [])])
        setLocalDisallowed([...(config.disallowed_tools ?? [])])
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load permission config')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [setServerConfig])

  // Detect unsaved changes
  const hasChanges =
    serverConfig !== null &&
    (localMode !== serverConfig.mode ||
      JSON.stringify(localAllowed) !== JSON.stringify(serverConfig.allowed_tools) ||
      JSON.stringify(localDisallowed) !== JSON.stringify(serverConfig.disallowed_tools))

  const handleSave = useCallback(async () => {
    const config: PermissionConfig = {
      mode: localMode,
      allowed_tools: localAllowed,
      disallowed_tools: localDisallowed,
    }
    try {
      setSaving(true)
      const saved = await chatApi.updatePermissionConfig(config)
      setServerConfig(saved)
      toast.success('Permission settings saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }, [localMode, localAllowed, localDisallowed, setServerConfig, toast])

  const handleCancel = () => {
    if (serverConfig) {
      setLocalMode(serverConfig.mode)
      setLocalAllowed([...(serverConfig.allowed_tools ?? [])])
      setLocalDisallowed([...(serverConfig.disallowed_tools ?? [])])
    }
  }

  // Mode color dot for the active mode
  const activeModeInfo = MODES.find((m) => m.mode === localMode)

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          {/* Gear icon */}
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
