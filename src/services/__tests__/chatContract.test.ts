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
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { checkContract, checkEventFrame, type ContractFile } from '../chatContract'
import { CHAT_EVENT_FIELDS, WS_CLIENT_MESSAGE_TYPES } from '@/types/chat'
import { CAPABILITY_KEYS, normalizeCapabilities, MINIMAL_CAPABILITIES } from '@/types/provider'
import { historyEventsToMessages, readSystemInitRuntime } from '@/utils/chatAssembly'

const dir = resolve(__dirname, '../__fixtures__/chat-contract')
const raw = readFileSync(resolve(dir, 'chat-contract.json'))
const contract = JSON.parse(raw.toString('utf8')) as ContractFile

describe('vendored contract file', () => {
  it('matches its recorded checksum (copy it with the sync script, never edit it by hand)', () => {
    const [recorded, name] = readFileSync(resolve(dir, 'CHECKSUMS.sha256'), 'utf8').trim().split(/\s+/)
    expect(name).toBe('chat-contract.json')
    expect(createHash('sha256').update(raw).digest('hex')).toBe(recorded)
  })
})

describe('chat contract — field level', () => {
  it('types every field of every frame the backend sends, and knows every variant', () => {
    expect(checkContract(contract)).toEqual([])
  })

  it('counts 32 event variants and 9 client messages', () => {
    expect(Object.keys(CHAT_EVENT_FIELDS)).toHaveLength(32)
    expect(Object.keys(WS_CLIENT_MESSAGE_TYPES)).toHaveLength(9)
    expect(new Set(contract.events.map((e) => e.type)).size).toBe(32)
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
  })

  it('reads every system_init frame: provider or none, and all 18 capability fields when carried', () => {
    const inits = contract.events.filter((e) => e.type === 'system_init')
    expect(inits.length).toBeGreaterThanOrEqual(2)
    const legacy = inits.find((e) => !('provider' in e))!
    expect(readSystemInitRuntime(legacy).provider).toBeNull()

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
