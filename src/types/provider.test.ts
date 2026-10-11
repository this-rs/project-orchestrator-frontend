/**
 * Provider types: legacy permission modes, capabilities and their fallback.
 *
 * Run with: npx vitest run src/types/provider.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  BOOLEAN_CAPABILITY_KEYS,
  CAPABILITY_KEYS,
  CLAUDE_CODE_CAPABILITIES,
  LEGACY_MODE_TO_POLICY,
  MINIMAL_CAPABILITIES,
  POLICY_TO_LEGACY_MODE,
  TOOL_POLICY_MODES,
  capabilitiesFallback,
  capabilitiesFor,
  hasSandbox,
  supportsScope,
  isClaudeCodeProvider,
  normalizeCapabilities,
  providerKindLabel,
  toCostBasis,
  toProviderRef,
  toToolCategory,
  toToolPolicy,
  toToolPolicyMode,
  type ProviderInstance,
} from './provider'

describe('toToolPolicyMode — permission modes, neutral and legacy', () => {
  it.each([
    ['default', 'ask'],
    ['manual', 'ask'],
    ['dontAsk', 'ask'],
    ['acceptEdits', 'auto_edits'],
    ['auto', 'auto_edits'],
    ['plan', 'plan_only'],
    ['bypassPermissions', 'trust'],
  ])('reads the Claude mode %s as %s', (legacy, neutral) => {
    expect(toToolPolicyMode(legacy)).toBe(neutral)
  })

  it('reads the four neutral modes as themselves', () => {
    for (const mode of TOOL_POLICY_MODES) expect(toToolPolicyMode(mode)).toBe(mode)
  })

  it.each([['yolo'], [''], [undefined], [null], [3], ['toString'], ['constructor']])(
    'refuses %s instead of guessing',
    (value) => {
      expect(toToolPolicyMode(value)).toBeNull()
    },
  )

  it('never maps a legacy mode to something more permissive than `trust` only for bypassPermissions', () => {
    const trusting = Object.entries(LEGACY_MODE_TO_POLICY).filter(([, m]) => m === 'trust').map(([k]) => k)
    expect(trusting).toEqual(['bypassPermissions'])
  })

  it('writes back a legacy string that reads as the same neutral mode', () => {
    for (const mode of TOOL_POLICY_MODES) {
      expect(toToolPolicyMode(POLICY_TO_LEGACY_MODE[mode])).toBe(mode)
    }
  })
})

describe('toToolPolicy', () => {
  it('reads the object form and keeps only string patterns', () => {
    expect(toToolPolicy({ mode: 'auto_edits', allow: ['Read', 3], deny: ['Bash(rm *)'] })).toEqual({
      mode: 'auto_edits',
      allow: ['Read'],
      deny: ['Bash(rm *)'],
    })
  })
  it('reads a bare mode, neutral or legacy', () => {
    expect(toToolPolicy('trust')).toEqual({ mode: 'trust', allow: [], deny: [] })
    expect(toToolPolicy('acceptEdits')).toEqual({ mode: 'auto_edits', native_mode: 'acceptEdits', allow: [], deny: [] })
    expect(toToolPolicy({ mode: 'auto_edits', native_mode: 'auto' })?.native_mode).toBe('auto')
  })
  it('refuses an unknown mode and non-objects', () => {
    expect(toToolPolicy({ mode: 'yolo' })).toBeNull()
    expect(toToolPolicy(undefined)).toBeNull()
    expect(toToolPolicy(42)).toBeNull()
  })
})

describe('capabilities', () => {
  it('lists every field of the contract exactly once', () => {
    expect([...CAPABILITY_KEYS].sort()).toEqual(Object.keys(CLAUDE_CODE_CAPABILITIES).sort())
    expect(Object.keys(MINIMAL_CAPABILITIES).sort()).toEqual(Object.keys(CLAUDE_CODE_CAPABILITIES).sort())
    expect(CAPABILITY_KEYS).toHaveLength(18)
  })

  it('gives the full Claude profile when nothing is declared', () => {
    expect(normalizeCapabilities(undefined)).toEqual(CLAUDE_CODE_CAPABILITIES)
    expect(normalizeCapabilities(null)).toEqual(CLAUDE_CODE_CAPABILITIES)
    // Everything the interface gates on is on.
    for (const key of ['interactive_permissions', 'thinking', 'images', 'tools', 'set_model_live', 'native_question', 'tool_cancel', 'background_tasks', 'resume', 'compaction_signal'] as const) {
      expect(CLAUDE_CODE_CAPABILITIES[key]).toBe(true)
    }
    // What the backend's Claude Code engine declares and accepts (`always` is refused by every
    // engine, P11b): the fallback never claims more.
    expect(CLAUDE_CODE_CAPABILITIES.permission_scopes).toEqual(['once', 'session'])
    expect(supportsScope(CLAUDE_CODE_CAPABILITIES, 'always')).toBe(false)
    expect(CLAUDE_CODE_CAPABILITIES.subagents).toBe('nested')
    expect(CLAUDE_CODE_CAPABILITIES.cost).toBe('reported')
  })

  it('does not hand out the shared constant (a caller mutating its copy must not change the profile)', () => {
    const a = normalizeCapabilities(null)
    a.images = false
    a.permission_scopes.push('once')
    expect(CLAUDE_CODE_CAPABILITIES.images).toBe(true)
    expect(CLAUDE_CODE_CAPABILITIES.permission_scopes).toHaveLength(2)
  })

  it('reads declared fields and falls back to the base for the rest', () => {
    const caps = normalizeCapabilities({ images: false, cost: 'priced', bogus: true }, CLAUDE_CODE_CAPABILITIES)
    expect(caps.images).toBe(false)
    expect(caps.cost).toBe('priced')
    expect(caps.thinking).toBe(true)
    expect(caps).not.toHaveProperty('bogus')
  })

  it('reads enumerations in snake_case and in PascalCase', () => {
    const caps = normalizeCapabilities(
      { hooks: 'InProtocol', subagents: 'SeparateThread', cost: 'Subscription' },
      MINIMAL_CAPABILITIES,
    )
    expect(caps.hooks).toBe('in_protocol')
    expect(caps.subagents).toBe('separate_thread')
    expect(caps.cost).toBe('subscription')
    expect(normalizeCapabilities({ subagents: 'separate_thread' }, MINIMAL_CAPABILITIES).subagents).toBe('separate_thread')
  })

  it('ignores a field of the wrong type rather than coercing it', () => {
    const caps = normalizeCapabilities({ images: 'yes', hooks: 7, cost: 'gratis', context_window: 'big', sandbox: true, permission_scopes: 'all' }, MINIMAL_CAPABILITIES)
    expect(caps).toEqual(MINIMAL_CAPABILITIES)
  })

  it('reads the context window, and keeps "unknown" as null (never an implicit size)', () => {
    expect(normalizeCapabilities({ context_window: { value: 32768, source: 'probed' } }).context_window).toEqual({ value: 32768, source: 'probed' })
    expect(normalizeCapabilities({ context_window: null }, { ...CLAUDE_CODE_CAPABILITIES, context_window: { value: 1, source: 'assumed' } }).context_window).toBeNull()
    expect(MINIMAL_CAPABILITIES.context_window).toBeNull()
  })

  it('reads the sandbox level and the permission scopes, dropping unknown scopes', () => {
    const caps = normalizeCapabilities({ sandbox: 'Workspace', permission_scopes: ['once', 'Session', 'forever'] }, MINIMAL_CAPABILITIES)
    expect(caps.sandbox).toBe('workspace')
    expect(caps.permission_scopes).toEqual(['once', 'session'])
    expect(hasSandbox(caps)).toBe(true)
    expect(hasSandbox(MINIMAL_CAPABILITIES)).toBe(false)
    expect(supportsScope(caps, 'session')).toBe(true)
    expect(supportsScope(caps, 'always')).toBe(false)
  })

  it('assumes nothing of a third-party provider that declares nothing', () => {
    expect(capabilitiesFallback('local-llama')).toBe(MINIMAL_CAPABILITIES)
    expect(capabilitiesFallback('whatever', 'codex')).toBe(MINIMAL_CAPABILITIES)
    for (const key of BOOLEAN_CAPABILITY_KEYS) expect(MINIMAL_CAPABILITIES[key]).toBe(false)
    expect(MINIMAL_CAPABILITIES.cost).toBe('unknown')
  })

  it('treats an absent provider, `claude-code` and the claude_code kind as Claude Code', () => {
    expect(capabilitiesFallback(undefined)).toBe(CLAUDE_CODE_CAPABILITIES)
    expect(capabilitiesFallback(null)).toBe(CLAUDE_CODE_CAPABILITIES)
    expect(capabilitiesFallback('claude-code')).toBe(CLAUDE_CODE_CAPABILITIES)
    expect(capabilitiesFallback('claude-work', 'claude_code')).toBe(CLAUDE_CODE_CAPABILITIES)
    expect(isClaudeCodeProvider('claude-work', 'ClaudeCode')).toBe(true)
    expect(isClaudeCodeProvider('claude-code', 'codex')).toBe(false)
  })
})

describe('capabilitiesFor — capabilities are per model', () => {
  const instance: ProviderInstance = {
    id: 'deepseek',
    kind: 'openai_compatible',
    label: 'DeepSeek',
    health: { status: 'healthy' },
    capabilities: { tools: true, thinking: false, cost: 'priced' },
    models: [
      { id: 'deepseek-chat' },
      { id: 'deepseek-reasoner', capabilities: { thinking: true } },
    ],
  }

  it('uses the model entry over the instance entry', () => {
    expect(capabilitiesFor(instance, 'deepseek-reasoner').thinking).toBe(true)
    expect(capabilitiesFor(instance, 'deepseek-chat').thinking).toBe(false)
  })
  it('keeps instance-level values the model does not override, and the floor below', () => {
    const caps = capabilitiesFor(instance, 'deepseek-reasoner')
    expect(caps.tools).toBe(true)
    expect(caps.cost).toBe('priced')
    expect(caps.images).toBe(false)
  })
  it('falls back to the instance for an unknown model, and to Claude for no instance', () => {
    expect(capabilitiesFor(instance, 'gone').thinking).toBe(false)
    expect(capabilitiesFor(null, 'claude-sonnet-4-5')).toEqual(CLAUDE_CODE_CAPABILITIES)
  })
})

describe('small readers', () => {
  it('reads system_init.provider as an id or an object', () => {
    expect(toProviderRef('local-llama')).toEqual({ id: 'local-llama' })
    expect(toProviderRef({ id: 'cx', kind: 'Codex', label: 'Codex' })).toEqual({ id: 'cx', kind: 'codex', label: 'Codex' })
    expect(toProviderRef(undefined)).toBeNull()
    expect(toProviderRef('')).toBeNull()
    expect(toProviderRef({ kind: 'codex' })).toBeNull()
  })
  it('reads cost bases and tool categories, refusing unknown ones', () => {
    expect(toCostBasis('Reported')).toBe('reported')
    expect(toCostBasis('gratis')).toBeNull()
    expect(toToolCategory('command')).toBe('command')
    expect(toToolCategory('Bash')).toBeNull()
  })
  it('labels a kind, including one it has never heard of', () => {
    expect(providerKindLabel('claude_code')).toBe('Claude Code')
    expect(providerKindLabel(undefined)).toBe('Claude Code')
    expect(providerKindLabel('openai_compatible')).toBe('OpenAI-compatible')
    expect(providerKindLabel('martian')).toBe('martian')
  })
})
