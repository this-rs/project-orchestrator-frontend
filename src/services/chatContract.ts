/**
 * Field-level check of chat wire frames against the frontend's types.
 *
 * `CHAT_EVENT_FIELDS` (types/chat.ts) is tied to the `ChatEvent` union by the
 * compiler: it lists every field of every variant, no more, no less. Checking
 * a real frame against that table therefore answers "does the frontend TYPE
 * everything the backend sends?" — which comparing variant names never did.
 *
 * Used by `__tests__/chatContract.test.ts` on the frames vendored from the
 * backend (`__fixtures__/chat-contract`, see `scripts/sync-chat-contract.mjs`).
 */
import {
  CHAT_CONTROL_FRAME_TYPES,
  CHAT_EVENT_FIELDS,
  WS_CLIENT_MESSAGE_TYPES,
  type ChatEventType,
} from '@/types/chat'
import { CAPABILITY_KEYS } from '@/types/provider'

/** Fields the transport adds around an event; they are not part of the variant. */
export const ENVELOPE_FIELDS: readonly string[] = ['type', 'seq', 'replaying', 'created_at', 'id_seq']

export interface ContractFile {
  contract_version?: string
  events: Record<string, unknown>[]
  control_frames?: Record<string, unknown>[]
  client_messages?: Record<string, unknown>[]
}

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k)

/** Problems of ONE event frame. Empty = the frame is fully typed. */
export function checkEventFrame(frame: Record<string, unknown>): string[] {
  const type = frame.type
  if (typeof type !== 'string') return ['frame has no `type`']
  if (!has(CHAT_EVENT_FIELDS, type)) return [`unknown event variant \`${type}\` (not in ChatEvent)`]
  const fields = CHAT_EVENT_FIELDS[type as ChatEventType] as Record<string, 'required' | 'optional'>
  const problems: string[] = []
  for (const key of Object.keys(frame)) {
    if (ENVELOPE_FIELDS.includes(key) && !has(fields, key)) continue
    if (!has(fields, key)) problems.push(`\`${type}.${key}\` is sent by the backend but not typed by the frontend`)
  }
  for (const [key, need] of Object.entries(fields)) {
    if (need === 'required' && !has(frame, key)) {
      problems.push(`\`${type}.${key}\` is required by the frontend but absent from the frame`)
    }
  }
  if (type === 'system_init' && typeof frame.capabilities === 'object' && frame.capabilities !== null) {
    for (const key of Object.keys(frame.capabilities)) {
      if (!(CAPABILITY_KEYS as readonly string[]).includes(key)) {
        problems.push(`\`system_init.capabilities.${key}\` is not a capability the frontend knows`)
      }
    }
  }
  return problems
}

/** Problems of a whole contract file: untyped fields, unknown variants, variants without a frame. */
export function checkContract(file: ContractFile): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  for (const frame of file.events) {
    if (typeof frame.type === 'string') seen.add(frame.type)
    problems.push(...checkEventFrame(frame))
  }
  for (const type of Object.keys(CHAT_EVENT_FIELDS)) {
    if (!seen.has(type)) problems.push(`no sample frame for \`${type}\`: the frontend types a variant the backend does not emit`)
  }
  for (const frame of file.control_frames ?? []) {
    if (typeof frame.type !== 'string' || !has(CHAT_CONTROL_FRAME_TYPES, frame.type)) {
      problems.push(`unknown control frame \`${String(frame.type)}\``)
    }
  }
  const clientSeen = new Set<string>()
  for (const frame of file.client_messages ?? []) {
    if (typeof frame.type !== 'string' || !has(WS_CLIENT_MESSAGE_TYPES, frame.type)) {
      problems.push(`client message \`${String(frame.type)}\` is accepted by the backend but the frontend cannot send it`)
    } else {
      clientSeen.add(frame.type)
    }
  }
  if (file.client_messages) {
    for (const type of Object.keys(WS_CLIENT_MESSAGE_TYPES)) {
      if (!clientSeen.has(type)) problems.push(`client message \`${type}\` is sent by the frontend but absent from the backend contract`)
    }
  }
  return problems
}
