/**
 * The provider of a session, as the HISTORY reducer reads it from
 * `system_init`. The live reducer is tested on the same frames in
 * `hooks/__tests__/useChat.provider.test.tsx`.
 *
 * Run with: npx vitest run src/utils/chatAssembly.provider.test.ts
 */
import { describe, it, expect } from 'vitest'
import { historyEventsToMessages, lastSystemInitRuntime, readSystemInitRuntime } from './chatAssembly'
import { LEGACY_SYSTEM_INIT, NATIVE_SYSTEM_INIT } from './__fixtures__/systemInitFrames'
import { CLAUDE_CODE_CAPABILITIES, capabilitiesFallback, normalizeCapabilities } from '@/types/provider'

const initBlock = (events: unknown[]) =>
  historyEventsToMessages(events as never[]).flatMap((m) => m.blocks).find((b) => b.type === 'system_init')

describe('system_init without a provider (session created before providers)', () => {
  it('names no provider, so the session is a Claude Code session with the full profile', () => {
    const rt = readSystemInitRuntime(LEGACY_SYSTEM_INIT)
    expect(rt.provider).toBeNull()
    expect(rt.capabilities).toBeNull()
    expect(normalizeCapabilities(rt.capabilities, capabilitiesFallback(rt.provider?.id))).toEqual(CLAUDE_CODE_CAPABILITIES)
  })

  it('reads the legacy permission mode as a neutral policy', () => {
    expect(readSystemInitRuntime(LEGACY_SYSTEM_INIT).toolPolicy).toEqual({ mode: 'ask', native_mode: 'default', allow: [], deny: [] })
    expect(readSystemInitRuntime({ ...LEGACY_SYSTEM_INIT, permission_mode: 'bypassPermissions' }).toolPolicy?.mode).toBe('trust')
  })

  it('renders the same block as before: no provider fields on it', () => {
    const block = initBlock([{ ...LEGACY_SYSTEM_INIT, created_at: 1_700_000_000 }])
    expect(block?.metadata).toEqual({
      model: 'claude-sonnet-4-5',
      tools_count: 3,
      mcp_servers_count: 1,
      permission_mode: 'default',
    })
  })
})

describe('system_init with a provider', () => {
  it('reads provider, capabilities and tool policy', () => {
    const rt = readSystemInitRuntime(NATIVE_SYSTEM_INIT)
    expect(rt.provider).toEqual({ id: 'local-llama', kind: 'openai_compatible', label: 'Local llama-server' })
    expect(rt.capabilities).toBe(NATIVE_SYSTEM_INIT.capabilities)
    expect(rt.toolPolicy).toEqual({ mode: 'ask', allow: [], deny: ['mcp__project-orchestrator__plan'] })
  })

  it('puts the provider on the system_init block', () => {
    const block = initBlock([{ ...NATIVE_SYSTEM_INIT, created_at: 1_700_000_000 }])
    expect(block?.metadata).toMatchObject({
      model: 'qwen2.5-coder-32b',
      provider: 'local-llama',
      provider_kind: 'openai_compatible',
      provider_label: 'Local llama-server',
    })
  })

  it('accepts a session without cli_session_id', () => {
    expect('cli_session_id' in NATIVE_SYSTEM_INIT).toBe(false)
    expect(initBlock([NATIVE_SYSTEM_INIT])).toBeDefined()
  })
})

describe('lastSystemInitRuntime', () => {
  it('takes the LAST system_init of the window (a resume may change the capabilities)', () => {
    const resumed = { ...NATIVE_SYSTEM_INIT, capabilities: { ...NATIVE_SYSTEM_INIT.capabilities, images: true } }
    const rt = lastSystemInitRuntime([LEGACY_SYSTEM_INIT, { type: 'assistant_text', content: 'x' }, NATIVE_SYSTEM_INIT, resumed, { type: 'result' }])
    expect(rt?.provider?.id).toBe('local-llama')
    expect(rt?.capabilities?.images).toBe(true)
  })
  it('reads a record that nests its payload under `data`', () => {
    const rt = lastSystemInitRuntime([{ type: 'system_init', seq: 4, data: { provider: 'codex-1', capabilities: { tools: true } } }])
    expect(rt?.provider).toEqual({ id: 'codex-1' })
    expect(rt?.capabilities).toEqual({ tools: true })
  })
  it('is null for a window with no system_init', () => {
    expect(lastSystemInitRuntime([{ type: 'assistant_text', content: 'x' }, null])).toBeNull()
  })
})

describe('readSystemInitRuntime — engine', () => {
  it('reads the engine and what it cannot do', () => {
    const rt = readSystemInitRuntime({ type: 'system_init', engine: 'agent', degraded_features: ['hooks', 'retry', 3] })
    expect(rt.engine).toBe('agent')
    expect(rt.degradedFeatures).toEqual(['hooks', 'retry'])
  })

  it('says nothing for a system_init without them (legacy, or an older backend)', () => {
    const rt = readSystemInitRuntime(LEGACY_SYSTEM_INIT)
    expect(rt.engine).toBeNull()
    expect(rt.degradedFeatures).toEqual([])
  })
})
