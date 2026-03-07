// ============================================================================
// FSMCanvas — Interactive FSM editor using @xyflow/react
// ============================================================================

import { memo, useCallback, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useReactFlow,
  MarkerType,
  type NodeProps,
  type Node,
  type Edge,
  type Connection,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useDroppable } from '@dnd-kit/core'
import {
  Play,
  Circle,
  Square,
  X,
} from 'lucide-react'
import type { ComposerState, ComposerTransition, ComposerNoteBinding } from './types'
import type { Note } from '@/types'

// ============================================================================
// CONSTANTS
// ============================================================================

const STATE_TYPE_CONFIG = {
  start: { icon: Play, color: '#22C55E', bg: '#052e16' },
  intermediate: { icon: Circle, color: '#FB923C', bg: '#431407' },
  terminal: { icon: Square, color: '#EF4444', bg: '#450a0a' },
} as const

type StateType = keyof typeof STATE_TYPE_CONFIG

// ============================================================================
// CUSTOM STATE NODE
// ============================================================================

interface StateNodeData extends Record<string, unknown> {
  label: string
  stateType: StateType
  action?: string
  boundNotes: { note_id: string; preview: string }[]
  onDelete: (name: string) => void
  onChangeType: (name: string, type: StateType) => void
}

function StateNodeComponent({ data, selected }: NodeProps<Node<StateNodeData>>) {
  const cfg = STATE_TYPE_CONFIG[data.stateType]
  const Icon = cfg.icon

  return (
    <div
      className="relative group"
      style={{
        minWidth: 120,
        borderRadius: 8,
        background: selected ? '#1e293b' : cfg.bg,
        border: `2px solid ${selected ? '#93C5FD' : cfg.color}`,
        boxShadow: selected ? `0 0 12px ${cfg.color}40` : undefined,
        transition: 'all 150ms ease',
      }}
    >
      {/* Handles */}
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !border-0" style={{ background: cfg.color }} />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !border-0" style={{ background: cfg.color }} />

      {/* Header */}
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <Icon size={12} color={cfg.color} />
        <span className="text-[11px] font-medium text-slate-200 flex-1 truncate">
          {data.label}
        </span>

        {/* Type cycle button */}
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-slate-300"
          onClick={(e) => {
            e.stopPropagation()
            const types: StateType[] = ['start', 'intermediate', 'terminal']
            const idx = types.indexOf(data.stateType)
            data.onChangeType(data.label, types[(idx + 1) % types.length])
          }}
          title="Cycle state type"
        >
          <Circle size={8} />
        </button>

        {/* Delete button */}
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-red-400"
          onClick={(e) => {
            e.stopPropagation()
            data.onDelete(data.label)
          }}
          title="Delete state"
        >
          <X size={10} />
        </button>
      </div>

      {/* Action */}
      {data.action && (
        <div className="px-2 pb-1">
          <span className="text-[9px] font-mono text-cyan-600">
            action: {data.action}
          </span>
        </div>
      )}

      {/* Bound notes */}
      {data.boundNotes.length > 0 && (
        <div className="px-2 pb-1.5 space-y-0.5">
          {data.boundNotes.map((bn) => (
            <div
              key={bn.note_id}
              className="flex items-center gap-1 bg-amber-950/20 rounded px-1 py-0.5 border border-amber-900/20"
            >
              <div className="w-1 h-1 rounded-full bg-amber-500 shrink-0" />
              <span className="text-[8px] text-amber-400 truncate">{bn.preview}</span>
            </div>
          ))}
        </div>
      )}

      {/* State type label */}
      <div className="px-2 pb-1.5">
        <span className="text-[8px] uppercase tracking-wider" style={{ color: cfg.color }}>
          {data.stateType}
        </span>
      </div>
    </div>
  )
}

const StateNode = memo(StateNodeComponent)

// ============================================================================
// CUSTOM EDGE (with delete and label)
// ============================================================================

const nodeTypes = { stateNode: StateNode }

// ============================================================================
// TRANSITION DIALOG
// ============================================================================

interface TransitionDialogProps {
  connection: Connection
  stateNames: Map<string, string>
  onConfirm: (trigger: string, guard?: string) => void
  onCancel: () => void
}

function TransitionDialog({ connection, stateNames, onConfirm, onCancel }: TransitionDialogProps) {
  const [trigger, setTrigger] = useState('')
  const [guard, setGuard] = useState('')

  const fromName = stateNames.get(connection.source ?? '') ?? '?'
  const toName = stateNames.get(connection.target ?? '') ?? '?'

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-4 w-72 shadow-xl">
        <h4 className="text-xs font-semibold text-slate-300 mb-3">
          New Transition: {fromName} → {toName}
        </h4>

        <label className="block text-[10px] text-slate-500 mb-1">Trigger *</label>
        <input
          autoFocus
          type="text"
          value={trigger}
          onChange={(e) => setTrigger(e.target.value)}
          placeholder="e.g. task_completed, user_approved"
          className="w-full px-2 py-1.5 text-[11px] bg-slate-900 border border-slate-600 rounded text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 mb-2"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && trigger.trim()) onConfirm(trigger.trim(), guard.trim() || undefined)
            if (e.key === 'Escape') onCancel()
          }}
        />

        <label className="block text-[10px] text-slate-500 mb-1">Guard (optional)</label>
        <input
          type="text"
          value={guard}
          onChange={(e) => setGuard(e.target.value)}
          placeholder="e.g. all_tests_pass"
          className="w-full px-2 py-1.5 text-[11px] bg-slate-900 border border-slate-600 rounded text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 mb-3"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && trigger.trim()) onConfirm(trigger.trim(), guard.trim() || undefined)
            if (e.key === 'Escape') onCancel()
          }}
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1 text-[10px] text-slate-400 hover:text-slate-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => trigger.trim() && onConfirm(trigger.trim(), guard.trim() || undefined)}
            disabled={!trigger.trim()}
            className="px-3 py-1 text-[10px] font-medium bg-indigo-600 text-white rounded hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Add Transition
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// ADD STATE DIALOG
// ============================================================================

interface AddStateDialogProps {
  position: { x: number; y: number }
  onConfirm: (name: string, type: StateType) => void
  onCancel: () => void
}

function AddStateDialog({ onConfirm, onCancel }: AddStateDialogProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<StateType>('intermediate')

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-4 w-64 shadow-xl">
        <h4 className="text-xs font-semibold text-slate-300 mb-3">New State</h4>

        <label className="block text-[10px] text-slate-500 mb-1">Name *</label>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. analyzing, waiting_approval"
          className="w-full px-2 py-1.5 text-[11px] bg-slate-900 border border-slate-600 rounded text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 mb-3"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) onConfirm(name.trim(), type)
            if (e.key === 'Escape') onCancel()
          }}
        />

        <label className="block text-[10px] text-slate-500 mb-1">Type</label>
        <div className="flex gap-1.5 mb-3">
          {(['start', 'intermediate', 'terminal'] as StateType[]).map((t) => {
            const cfg = STATE_TYPE_CONFIG[t]
            const Icon = cfg.icon
            return (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition-colors ${
                  type === t
                    ? 'border-current bg-current/10'
                    : 'border-slate-700 text-slate-500 hover:text-slate-400'
                }`}
                style={type === t ? { color: cfg.color, borderColor: cfg.color } : undefined}
              >
                <Icon size={10} />
                {t}
              </button>
            )
          })}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1 text-[10px] text-slate-400 hover:text-slate-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => name.trim() && onConfirm(name.trim(), type)}
            disabled={!name.trim()}
            className="px-3 py-1 text-[10px] font-medium bg-indigo-600 text-white rounded hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Add State
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// FSM CANVAS
// ============================================================================

interface FSMCanvasProps {
  states: ComposerState[]
  transitions: ComposerTransition[]
  noteBindings: ComposerNoteBinding[]
  /** All notes keyed by ID for preview text */
  noteMap: Map<string, Note>
  onStatesChange: (states: ComposerState[]) => void
  onTransitionsChange: (transitions: ComposerTransition[]) => void
  onNoteBindingsChange: (bindings: ComposerNoteBinding[]) => void
  onDeleteTransition: (fromState: string, toState: string, trigger: string) => void
}

function FSMCanvasComponent({
  states,
  transitions,
  noteBindings,
  noteMap,
  onStatesChange,
  onTransitionsChange,
  onNoteBindingsChange,
  onDeleteTransition,
}: FSMCanvasProps) {
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null)
  const [addStatePos, setAddStatePos] = useState<{ x: number; y: number } | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  // Make the entire canvas a droppable zone for notes
  const { setNodeRef: setDropRef } = useDroppable({ id: 'fsm-canvas' })

  // Build state name → node ID map
  const stateNameMap = useMemo(
    () => new Map(states.map((s) => [`state-${s.name}`, s.name])),
    [states]
  )

  // Handler: delete a state
  const handleDeleteState = useCallback(
    (name: string) => {
      onStatesChange(states.filter((s) => s.name !== name))
      onTransitionsChange(transitions.filter((t) => t.from_state !== name && t.to_state !== name))
      onNoteBindingsChange(noteBindings.filter((nb) => nb.state_name !== name))
    },
    [states, transitions, noteBindings, onStatesChange, onTransitionsChange, onNoteBindingsChange]
  )

  // Handler: change state type
  const handleChangeType = useCallback(
    (name: string, newType: StateType) => {
      onStatesChange(
        states.map((s) => (s.name === name ? { ...s, state_type: newType } : s))
      )
    },
    [states, onStatesChange]
  )

  // Convert composer states to xyflow nodes
  const nodes: Node<StateNodeData>[] = useMemo(() => {
    return states.map((s) => {
      const boundNotes = noteBindings
        .filter((nb) => nb.state_name === s.name)
        .map((nb) => ({
          note_id: nb.note_id,
          preview: noteMap.get(nb.note_id)?.content.slice(0, 40) ?? nb.note_id.slice(0, 8),
        }))

      return {
        id: `state-${s.name}`,
        type: 'stateNode',
        position: { x: s.x, y: s.y },
        data: {
          label: s.name,
          stateType: (s.state_type ?? 'intermediate') as StateType,
          action: s.action,
          boundNotes,
          onDelete: handleDeleteState,
          onChangeType: handleChangeType,
        },
      }
    })
  }, [states, noteBindings, noteMap, handleDeleteState, handleChangeType])

  // Convert transitions to xyflow edges
  const edges: Edge[] = useMemo(() => {
    return transitions.map((t, i) => ({
      id: `edge-${t.from_state}-${t.to_state}-${i}`,
      source: `state-${t.from_state}`,
      target: `state-${t.to_state}`,
      label: t.guard ? `${t.trigger} [${t.guard}]` : t.trigger,
      type: 'default',
      markerEnd: { type: MarkerType.ArrowClosed, color: '#FB923C' },
      style: { stroke: '#FB923C', strokeWidth: 2 },
      labelStyle: { fill: '#FB923C', fontSize: 9, fontFamily: 'monospace' },
      labelBgStyle: { fill: '#0f172a', stroke: '#FB923C20', strokeWidth: 1 },
      labelBgPadding: [4, 2] as [number, number],
      data: { fromState: t.from_state, toState: t.to_state, trigger: t.trigger },
    }))
  }, [transitions])

  // Node position changes
  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      // Apply xyflow changes (position drag, selection, etc.)
      const updated = applyNodeChanges(changes, nodes as Node[])
      // Sync positions back to composer states
      const posChanged = changes.some((c) => c.type === 'position' && c.position)
      if (posChanged) {
        onStatesChange(
          states.map((s) => {
            const node = updated.find((n) => n.id === `state-${s.name}`)
            if (node && node.position) {
              return { ...s, x: node.position.x, y: node.position.y }
            }
            return s
          })
        )
      }
    },
    [nodes, states, onStatesChange]
  )

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      applyEdgeChanges(changes, edges)
      // Handle edge removal
      for (const change of changes) {
        if (change.type === 'remove') {
          const edge = edges.find((e) => e.id === change.id)
          if (edge?.data) {
            const d = edge.data as { fromState: string; toState: string; trigger: string }
            onDeleteTransition(d.fromState, d.toState, d.trigger)
          }
        }
      }
    },
    [edges, onDeleteTransition]
  )

  // Connection (new edge): show dialog for trigger/guard
  const onConnect: OnConnect = useCallback((connection: Connection) => {
    setPendingConnection(connection)
  }, [])

  const handleConfirmTransition = useCallback(
    (trigger: string, guard?: string) => {
      if (!pendingConnection) return
      const fromName = stateNameMap.get(pendingConnection.source ?? '')
      const toName = stateNameMap.get(pendingConnection.target ?? '')
      if (fromName && toName) {
        onTransitionsChange([
          ...transitions,
          { from_state: fromName, to_state: toName, trigger, guard },
        ])
      }
      setPendingConnection(null)
    },
    [pendingConnection, stateNameMap, transitions, onTransitionsChange]
  )

  // Double-click canvas → add state
  const onPaneDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      setAddStatePos(pos)
    },
    [screenToFlowPosition]
  )

  const handleAddState = useCallback(
    (name: string, type: StateType) => {
      if (states.some((s) => s.name === name)) {
        // Name collision — just append a suffix
        name = `${name}_${states.length}`
      }
      onStatesChange([
        ...states,
        {
          name,
          state_type: type,
          x: addStatePos?.x ?? 200,
          y: addStatePos?.y ?? 200,
        },
      ])
      setAddStatePos(null)
    },
    [states, addStatePos, onStatesChange]
  )

  // Edge click → delete (with confirmation)
  const onEdgeDoubleClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      if (edge.data) {
        const d = edge.data as { fromState: string; toState: string; trigger: string }
        onDeleteTransition(d.fromState, d.toState, d.trigger)
      }
    },
    [onDeleteTransition]
  )

  return (
    <div
      ref={(node) => {
        setDropRef(node)
        ;(canvasRef as React.MutableRefObject<HTMLDivElement | null>).current = node
      }}
      className="relative h-full w-full"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDoubleClick={onPaneDoubleClick}
        onEdgeDoubleClick={onEdgeDoubleClick}
        fitView
        proOptions={{ hideAttribution: true }}
        className="bg-slate-950"
        defaultEdgeOptions={{
          style: { stroke: '#FB923C', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#FB923C' },
        }}
      >
        <Background color="#1e293b" gap={20} />
        <Controls
          position="bottom-right"
          className="!bg-slate-800 !border-slate-700 !rounded-md [&_button]:!bg-slate-800 [&_button]:!border-slate-700 [&_button]:!fill-slate-400 [&_button:hover]:!bg-slate-700"
        />
        <MiniMap
          position="bottom-left"
          style={{ background: '#0f172a', border: '1px solid #334155' }}
          nodeColor="#FB923C"
          maskColor="#0f172a80"
        />
      </ReactFlow>

      {/* Empty state hint */}
      {states.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-sm text-slate-500 mb-1">Double-click to add a state</p>
            <p className="text-[10px] text-slate-600">Drag between handles to create transitions</p>
          </div>
        </div>
      )}

      {/* Transition dialog */}
      {pendingConnection && (
        <TransitionDialog
          connection={pendingConnection}
          stateNames={stateNameMap}
          onConfirm={handleConfirmTransition}
          onCancel={() => setPendingConnection(null)}
        />
      )}

      {/* Add state dialog */}
      {addStatePos && (
        <AddStateDialog
          position={addStatePos}
          onConfirm={handleAddState}
          onCancel={() => setAddStatePos(null)}
        />
      )}
    </div>
  )
}

export const FSMCanvas = memo(FSMCanvasComponent)
