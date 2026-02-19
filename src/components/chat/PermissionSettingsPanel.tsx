import { useState, useEffect, useCallback, useRef } from 'react'
import { useAtom } from 'jotai'
import { chatPermissionConfigAtom } from '@/atoms'
import { chatApi } from '@/services/chat'
import { useToast } from '@/hooks'
import type { PermissionMode, PermissionConfig } from '@/types'

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
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
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
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a7.723 7.723 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-sm font-medium text-gray-300">Permission Settings</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition-colors"
          title="Close settings"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <svg className="w-5 h-5 animate-spin text-gray-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
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
