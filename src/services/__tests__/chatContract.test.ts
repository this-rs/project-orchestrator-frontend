/**
 * Chat wire contract, at FIELD level, on the frames vendored from the backend.
 *
 * What fails this test:
 *  - a backend frame carrying a field the frontend does not type;
 *  - a backend variant / client message the frontend does not know, or the reverse;
 *  - a vendored copy whose checksum no longer matches (edited by hand).
 *
 * Refresh the copy with:  node scripts/sync-chat-contract.mjs <backend file>
 * Run with:               npx vitest run src/services/__tests__/chatContract.test.ts
 */
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  checkBackendFields,
  checkContract,
  checkProviderAdditions,
  type ProviderAdditionsFile,
  checkEventFrame,
  fromBackendContract,
  type BackendContractFiles,
  type ContractFile,
} from '../chatContract'
import { CHAT_EVENT_FIELDS, WS_CLIENT_MESSAGE_TYPES } from '@/types/chat'
import { CAPABILITY_KEYS, normalizeCapabilities, MINIMAL_CAPABILITIES } from '@/types/provider'
import { historyEventsToMessages, readSystemInitRuntime } from '@/utils/chatAssembly'

const dir = resolve(__dirname, '../__fixtures__/chat-contract')
const sha256 = (name: string) => createHash('sha256').update(readFileSync(resolve(dir, name))).digest('hex')
const readJson = <T,>(name: string) => JSON.parse(readFileSync(resolve(dir, name), 'utf8')) as T

/**
 * Two sets of frames live in the fixture directory:
 *  - the BACKEND's (`server-events.json`, `client-messages.json`,
 *    `control-frames.json`, `SHA256SUMS`), copied as is by the sync script:
 *    what the backend emits TODAY. Authoritative.
 *  - `provisional-target-frames.json` + `PROVISIONAL-TARGET.sha256`, hand-written TARGET frames:
 *    the same wire plus the fields the provider work adds (provider,
 *    capabilities, tool policy, cost basis, tool category…), from the nexus
 *    agent contract. They keep the frontend types honest about a wire the
 *    backend does not emit yet, and go away when the backend's examples
 *    carry those fields.
 */
const fromBackend = existsSync(resolve(dir, 'server-events.json'))
const backendFiles: BackendContractFiles | null = fromBackend
  ? {
      serverEvents: readJson('server-events.json'),
      clientMessages: existsSync(resolve(dir, 'client-messages.json')) ? readJson('client-messages.json') : undefined,
      controlFrames: existsSync(resolve(dir, 'control-frames.json')) ? readJson('control-frames.json') : undefined,
    }
  : null
const target: ContractFile | null = existsSync(resolve(dir, 'provisional-target-frames.json')) ? readJson<ContractFile>('provisional-target-frames.json') : null
const contract: ContractFile = backendFiles ? fromBackendContract(backendFiles) : target!

describe('vendored contract files', () => {
  it('match their recorded checksums (copy them with the sync script, never edit them by hand)', () => {
    const checked: string[] = []
    for (const sumsFile of ['SHA256SUMS', 'VENDORED-EXTRA.sha256', 'PROVISIONAL-TARGET.sha256']) {
      if (!existsSync(resolve(dir, sumsFile))) continue
      const lines = readFileSync(resolve(dir, sumsFile), 'utf8').trim().split('\n').map((line) => line.trim().split(/\s+/))
      for (const [recorded, rawName] of lines) {
        const name = rawName.replace(/^\*/, '')
        expect(sha256(name), name).toBe(recorded)
        checked.push(name)
      }
    }
    if (fromBackend) expect(checked).toEqual(expect.arrayContaining(['server-events.json', 'client-messages.json', 'control-frames.json']))
    if (target) expect(checked).toContain('provisional-target-frames.json')
    expect(checked.length).toBeGreaterThan(0)
  })

  it.runIf(fromBackend)('agree with the frontend on which fields may be absent', () => {
    expect(checkBackendFields(backendFiles!.serverEvents.events)).toEqual([])
  })
})

describe('chat contract — field level', () => {
  it('types every field of every frame the backend sends, and knows every variant', () => {
    expect(checkContract(contract)).toEqual([])
  })

  it.runIf(target !== null)('types every field of the target frames too (provider, capabilities, cost basis…)', () => {
    expect(checkContract(target!)).toEqual([])
  })

  it('counts 33 event variants and 9 client messages', () => {
    expect(Object.keys(CHAT_EVENT_FIELDS)).toHaveLength(33)
    expect(Object.keys(WS_CLIENT_MESSAGE_TYPES)).toHaveLength(9)
    expect(new Set(contract.events.map((e) => e.type)).size).toBe(33)
  })

  it('no longer treats partial_text and viz_block as events, and knows compaction_recovery and cancel_tools', () => {
    expect(CHAT_EVENT_FIELDS).not.toHaveProperty('partial_text')
    expect(CHAT_EVENT_FIELDS).not.toHaveProperty('viz_block')
    expect(CHAT_EVENT_FIELDS).toHaveProperty('compaction_recovery')
    expect(WS_CLIENT_MESSAGE_TYPES).toHaveProperty('cancel_tools')
  })
})

describe('negative controls — the check really fails on a drift', () => {
  it('fails when the backend adds a field to system_init that the frontend does not type', () => {
    const frame = { type: 'system_init', model: 'm', sandbox_profile: 'strict' }
    expect(checkEventFrame(frame)).toEqual([
      '`system_init.sandbox_profile` is sent by the backend but not typed by the frontend',
    ])
  })

  it('fails on an unknown capability inside system_init', () => {
    const frame = { type: 'system_init', capabilities: { images: true, telepathy: true } }
    expect(checkEventFrame(frame)).toEqual([
      '`system_init.capabilities.telepathy` is not a capability the frontend knows',
    ])
  })

  it('fails when a field the frontend requires is renamed or dropped', () => {
    expect(checkEventFrame({ type: 'tool_use', id: 't', name: 'Bash', input: {} })).toEqual([
      '`tool_use.name` is sent by the backend but not typed by the frontend',
      '`tool_use.tool` is required by the frontend but absent from the frame',
    ])
  })

  it('fails on a variant the frontend does not know, and on one the backend stopped sending', () => {
    const unknown = checkContract({ events: [...contract.events, { type: 'provider_notice', value: {} }] })
    expect(unknown).toEqual(['unknown event variant `provider_notice` (not in ChatEvent)'])

    const missing = checkContract({ events: contract.events.filter((e) => e.type !== 'compaction_recovery') })
    expect(missing).toEqual([
      'no sample frame for `compaction_recovery`: the frontend types a variant the backend does not emit',
    ])
  })

  it('fails on a client message only one side knows', () => {
    const base = { events: contract.events }
    expect(checkContract({ ...base, client_messages: [...contract.client_messages!, { type: 'set_provider' }] })).toEqual([
      'client message `set_provider` is accepted by the backend but the frontend cannot send it',
    ])
    expect(
      checkContract({ ...base, client_messages: contract.client_messages!.filter((m) => m.type !== 'cancel_tools') }),
    ).toEqual(['client message `cancel_tools` is sent by the frontend but absent from the backend contract'])
  })

  it('ignores the transport envelope (seq, replaying, created_at)', () => {
    expect(checkEventFrame({ type: 'user_message', content: 'x', seq: 3, replaying: true, created_at: 1 })).toEqual([])
  })
})

describe('the frames replay in the reducers', () => {
  it('assembles every frame without throwing', () => {
    expect(() => historyEventsToMessages(contract.events as never[])).not.toThrow()
    if (target) expect(() => historyEventsToMessages(target.events as never[])).not.toThrow()
  })

  it('reads a system_init without provider as a Claude Code session', () => {
    const legacy = contract.events.find((e) => e.type === 'system_init' && !('provider' in e))
    expect(legacy).toBeDefined()
    expect(readSystemInitRuntime(legacy).provider).toBeNull()
    expect(readSystemInitRuntime(legacy).capabilities).toBeNull()
  })

  it.runIf(target !== null)('reads every target system_init frame: all 18 capability fields when carried', () => {
    const inits = target!.events.filter((e) => e.type === 'system_init')
    expect(inits.length).toBeGreaterThanOrEqual(2)

    for (const init of inits.filter((e) => 'capabilities' in e)) {
      const rt = readSystemInitRuntime(init)
      expect(rt.provider?.id).toBeTruthy()
      expect(Object.keys(rt.capabilities!).sort()).toEqual([...CAPABILITY_KEYS].sort())
      // Every carried value is understood: normalising over the floor keeps none of the floor's defaults by accident.
      const caps = normalizeCapabilities(rt.capabilities, MINIMAL_CAPABILITIES)
      for (const key of CAPABILITY_KEYS) {
        const sent = (rt.capabilities as Record<string, unknown>)[key]
        expect(caps[key], key).toEqual(sent)
      }
      expect(Array.isArray(caps.permission_scopes)).toBe(true)
      expect(['none', 'workspace', 'full']).toContain(caps.sandbox)
    }
  })
})

describe('backend-generated layout', () => {
  const files: BackendContractFiles = {
    serverEvents: {
      events: {
        user_message: {
          fields: { content: { type: 'string', required: true } },
          examples: { full: { content: 'hi' }, minimal: { content: '' } },
        },
        tool_result: {
          fields: {
            id: { type: 'string', required: true },
            result: { type: 'string', required: true },
            is_error: { type: 'boolean', required: true },
            parent_tool_use_id: { type: 'string', required: false },
          },
          examples: {
            full: { id: 't', result: 'ok', is_error: false, parent_tool_use_id: 'p' },
            minimal: { id: 't', result: 'ok', is_error: false },
          },
        },
      },
    },
    clientMessages: { messages: { interrupt: { fields: {}, examples: { full: {}, minimal: {} } } } },
    controlFrames: { frames: { replay_complete: { examples: { full: {} } } } },
  }

  it('flattens every example into a typed frame', () => {
    const flat = fromBackendContract(files)
    expect(flat.events).toHaveLength(4)
    expect(flat.events[0]).toEqual({ type: 'user_message', content: 'hi' })
    expect(flat.client_messages).toEqual([{ type: 'interrupt' }, { type: 'interrupt' }])
    expect(flat.control_frames).toEqual([{ type: 'replay_complete' }])
    for (const frame of flat.events) expect(checkEventFrame(frame)).toEqual([])
  })

  it('reports a field the backend describes and the frontend does not type, even without an example', () => {
    const events = { user_message: { fields: { content: { required: true }, origin: { required: false } } } }
    expect(checkBackendFields(events)).toEqual(['`user_message.origin` is described by the backend but not typed by the frontend'])
  })

  it('reports a field the frontend requires and the backend may omit', () => {
    const events = { tool_use: { fields: { id: { required: true }, tool: { required: false }, input: { required: true } } } }
    expect(checkBackendFields(events)).toEqual(['`tool_use.tool` may be absent on the wire but the frontend types it as required'])
  })
})

describe('provider-additions routing enums', () => {
  const additions = readJson<ProviderAdditionsFile>('provider-additions.json')

  it('accepts routed_by "auto" and every other value of the fixture', () => {
    expect(checkProviderAdditions(additions)).toEqual([])
    expect(additions.rest?.ChatSession?.routed_by).toMatchObject({ enum: expect.arrayContaining(['auto']) })
  })

  it('flags a routed_by value the frontend does not know', () => {
    const bad = { rest: { ChatSession: { routed_by: { enum: ['auto', 'telepathy'] } } } } as ProviderAdditionsFile
    expect(checkProviderAdditions(bad)).toHaveLength(1)
  })
})
