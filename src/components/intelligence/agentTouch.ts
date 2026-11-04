// ============================================================================
// agentTouch — what an agent's tool call touches, as graph entity ids
// ============================================================================
//
// The socket relays the chat events of the sessions it is asked to watch
// (`/ws/events?sessions=`, frames `{kind:"chat", session_id, event}`). A tool
// call carries the thing it reads or edits in its input: a file path for the
// file tools, an entity id for the project-orchestrator tools. This module
// reads that out, so the node an agent works on can pulse the moment the call
// starts instead of at the next 5 s poll.
//
// Ported from po-graph (`interpretTool`), reduced to what a pulse needs: the
// ids, and a kind. Two rules come with it:
//   • a project-orchestrator WRITE is not a touch: it creates its own node,
//     which the graph channel already announces (`node_created`);
//   • a sub-agent call (`Task` / `Agent`) touches nothing.
//
// The ids are what the backend uses as node ids (a file's path, an entity's
// UUID): an id that is not on screen pulses nothing, harmlessly.
// ============================================================================

export type TouchKind = 'read' | 'edit' | 'search' | 'run' | 'query'

export interface AgentTouch {
  kind: TouchKind
  /** Entity ids the call designates, in the order they appear. Never empty. */
  refs: string[]
}

const PO_PREFIX = /^mcp__project-orchestrator__/
const PO_READ_ACTION = /^(get|list|search|find|analyze|read|show|check|is_|who|what|health|status)/
/** The input fields that name a graph entity, for the project-orchestrator tools. */
const PO_REF_FIELDS = ['file_path', 'path', 'task_id', 'plan_id', 'note_id', 'entity_id', 'decision_id', 'milestone_id'] as const
/** The input fields that name a file, for the file tools. */
const FILE_REF_FIELDS = ['file_path', 'path', 'notebook_path', 'filePath'] as const

type Raw = Record<string, unknown>

const asString = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)

/** The kind of a (non-PO) tool, from the neutral category the backend gives, else from its name. */
function kindOf(category: string, name: string): TouchKind | 'agent' {
  switch (category) {
    case 'edit':
      return 'edit'
    case 'search':
      return 'search'
    case 'command':
      return 'run'
    case 'read':
    case 'web':
      return 'read'
    case 'agent':
      return 'agent'
  }
  const low = name.toLowerCase()
  if (/^(agent|task)$/.test(low)) return 'agent'
  if (/edit|write|multiedit|notebookedit|apply_patch/.test(low)) return 'edit'
  if (/grep|glob|search|find/.test(low)) return 'search'
  if (/bash|shell|exec|command|terminal/.test(low)) return 'run'
  return 'read'
}

/**
 * What the tool call in `ev` touches, or null when it touches nothing a node
 * stands for. Takes the chat event as the socket relays it; anything that is
 * not a tool call (or has no readable input yet) gives null.
 */
export function touchedBy(ev: unknown): AgentTouch | null {
  if (!ev || typeof ev !== 'object') return null
  const e = ev as Raw
  const type = e.type
  // The start of a call carries no input yet; the resolved input follows.
  if (type !== 'tool_use' && type !== 'tool_use_input_resolved') return null
  const input = (e.input && typeof e.input === 'object' ? e.input : {}) as Raw
  const names = [asString(e.tool), asString(e.name), asString(e.canonical)].filter((n): n is string => n != null)
  const category = String(e.category ?? '').toLowerCase()

  const poName = names.find((n) => PO_PREFIX.test(n))
  if (poName) {
    const tool = poName.replace(PO_PREFIX, '')
    const action = asString(input.action) ?? tool
    const readOnly = tool === 'code' || PO_READ_ACTION.test(action) || /^(get_|list_|search|find|analyze)/.test(tool)
    if (!readOnly) return null
    const refs = PO_REF_FIELDS.map((f) => asString(input[f])).filter((r): r is string => r != null)
    return refs.length > 0 ? { kind: 'query', refs } : null
  }

  const kind = kindOf(category, asString(e.canonical) ?? asString(e.tool) ?? asString(e.name) ?? '')
  if (kind === 'agent') return null
  const paths = Array.isArray(input.paths) ? input.paths : []
  const ref = FILE_REF_FIELDS.map((f) => asString(input[f])).find((r) => r != null) ?? asString(paths[0])
  return ref ? { kind, refs: [ref] } : null
}
