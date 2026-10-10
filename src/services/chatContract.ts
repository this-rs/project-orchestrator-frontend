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
import { CAPABILITY_KEYS, ROUTED_BY_VALUES } from '@/types/provider'
import { LEARNING_STAGES, ROUTING_MODES } from '@/types/routing'

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

// ---------------------------------------------------------------------------
// Backend-generated contract (backend `docs/api/chat-contract/`)
// ---------------------------------------------------------------------------

/** One entry of a backend contract file: field descriptions plus two sample frames. */
export interface BackendContractEntry {
  fields?: Record<string, { type?: string; required?: boolean; nullable?: boolean }>
  examples?: { full?: Record<string, unknown>; minimal?: Record<string, unknown> }
}

/** The three files the backend generates, parsed. */
export interface BackendContractFiles {
  /** `server-events.json` — `events.<tag>`. */
  serverEvents: { events: Record<string, BackendContractEntry> }
  /** `client-messages.json` — `messages.<tag>`. */
  clientMessages?: { messages: Record<string, BackendContractEntry> }
  /** `control-frames.json` — `frames.<tag>` and the event envelope. */
  controlFrames?: { frames: Record<string, BackendContractEntry>; event_envelope?: unknown }
}

function sampleFrames(tag: string, entry: BackendContractEntry): Record<string, unknown>[] {
  const frames: Record<string, unknown>[] = []
  for (const example of [entry.examples?.full, entry.examples?.minimal]) {
    if (example && typeof example === 'object') frames.push({ type: tag, ...example })
  }
  // An entry without examples still names a variant: keep it visible to the check.
  return frames.length > 0 ? frames : [{ type: tag }]
}

/** Turn the backend's files into the flat frame lists `checkContract` reads. */
export function fromBackendContract(files: BackendContractFiles): ContractFile {
  const flat = (entries: Record<string, BackendContractEntry> | undefined) =>
    Object.entries(entries ?? {}).flatMap(([tag, entry]) => sampleFrames(tag, entry))
  return {
    events: flat(files.serverEvents.events),
    client_messages: files.clientMessages ? flat(files.clientMessages.messages) : undefined,
    control_frames: files.controlFrames ? flat(files.controlFrames.frames) : undefined,
  }
}

/**
 * Compare the backend's `required` flags with the frontend's table.
 *
 * - A field the backend may OMIT but the frontend types as required is a crash
 *   waiting for the first frame without it.
 * - A field the backend describes that the frontend does not type at all is
 *   reported even when no example happens to carry it.
 */
export function checkBackendFields(events: Record<string, BackendContractEntry>): string[] {
  const problems: string[] = []
  for (const [tag, entry] of Object.entries(events)) {
    if (!has(CHAT_EVENT_FIELDS, tag)) continue // reported by checkContract
    const typed = CHAT_EVENT_FIELDS[tag as ChatEventType] as Record<string, 'required' | 'optional'>
    for (const [field, spec] of Object.entries(entry.fields ?? {})) {
      if (field === 'type') continue
      if (!has(typed, field)) {
        problems.push(`\`${tag}.${field}\` is described by the backend but not typed by the frontend`)
      } else if (typed[field] === 'required' && spec.required === false) {
        problems.push(`\`${tag}.${field}\` may be absent on the wire but the frontend types it as required`)
      }
    }
  }
  return problems
}

// ---------------------------------------------------------------------------
// Hand-written REST additions (backend `provider-additions.json`)
// ---------------------------------------------------------------------------

/** One field description of `provider-additions.json` (`rest.<DTO>.<field>`). */
export interface AdditionsField {
  type?: string
  required?: boolean
  nullable?: boolean
  enum?: string[]
  doc?: string
}

/** The parts of `provider-additions.json` the frontend reads enums from. */
export interface ProviderAdditionsFile {
  rest?: {
    ChatSession?: Record<string, AdditionsField | unknown>
    CreateSessionRequest?: Record<string, AdditionsField | unknown>
  }
  /** Gone from the backend file since the routing settings became documented routes (`rest.routing`); read when present. */
  rest_routing?: {
    RoutingSettings?: Record<string, AdditionsField | unknown>
  }
}

const enumOf = (dto: Record<string, unknown> | undefined, field: string): string[] | null => {
  const f = dto?.[field]
  if (typeof f !== 'object' || f === null) return null
  const values = (f as AdditionsField).enum
  return Array.isArray(values) ? values.filter((v): v is string => typeof v === 'string') : null
}

/**
 * Every enum value the backend may put in `ChatSession.routed_by`,
 * `ChatSession.routing_mode` and the routing settings must be a value the
 * frontend knows — otherwise a session routed by a rule the interface never
 * heard of would render as "default" and lie about who chose.
 */
export function checkProviderAdditions(file: ProviderAdditionsFile): string[] {
  const problems: string[] = []
  const check = (where: string, values: string[] | null, known: readonly string[]) => {
    for (const value of values ?? []) {
      if (!known.includes(value)) problems.push(`\`${where}\` may be \`${value}\` on the wire but the frontend does not know that value`)
    }
  }
  const session = file.rest?.ChatSession as Record<string, unknown> | undefined
  const settings = file.rest_routing?.RoutingSettings as Record<string, unknown> | undefined
  check('ChatSession.routed_by', enumOf(session, 'routed_by'), ROUTED_BY_VALUES)
  check('ChatSession.routing_mode', enumOf(session, 'routing_mode'), ROUTING_MODES)
  const create = file.rest?.CreateSessionRequest as Record<string, unknown> | undefined
  check('CreateSessionRequest.routing_mode', enumOf(create, 'routing_mode'), ROUTING_MODES)
  check('RoutingSettings.mode', enumOf(settings, 'mode'), ROUTING_MODES)
  check('RoutingSettings.stage', enumOf(settings, 'stage'), LEARNING_STAGES)
  return problems
}
