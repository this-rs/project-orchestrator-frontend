// ============================================================================
// PatternComposer — Visual protocol editor
//
// Layout: NotePool (left) | FSMCanvas (center) | Properties (right)
// ============================================================================

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { ReactFlowProvider } from '@xyflow/react'
import {
  Save,
  Loader2,
  Check,
  Zap,
  AlertCircle,
  Download,
} from 'lucide-react'
import { NotePool } from './NotePool'
import { FSMCanvas } from './FSMCanvas'
import { TriggerBuilder, DEFAULT_VECTOR } from './TriggerBuilder'
import { ContextRadar } from '../intelligence/ContextRadar'
import { createEmptyModel } from './types'
import type { ComposerModel, ComposerState, ComposerTransition, ComposerNoteBinding } from './types'
import type { Note } from '@/types'
import type { ComposeProtocolRequest, SimulateResponse, RelevanceVector } from '@/types/intelligence'
import { intelligenceApi } from '@/services/intelligence'
import { notesApi } from '@/services/notes'

// ============================================================================
// PROPERTIES PANEL
// ============================================================================

interface PropertiesPanelProps {
  model: ComposerModel
  onModelChange: (update: Partial<ComposerModel>) => void
  simulateResult: SimulateResponse | null
  simulating: boolean
  onSimulate: () => void
  onExportJson: () => void
  /** Set after a successful compose — enables simulate with real protocol_id */
  composedProtocolId: string | null
  composedSkillId: string | null
}

function PropertiesPanel({ model, onModelChange, simulateResult, simulating, onSimulate, onExportJson, composedProtocolId, composedSkillId }: PropertiesPanelProps) {
  const relevanceVector = model.relevance_vector ?? DEFAULT_VECTOR

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-slate-700/50">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Properties
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {/* Name */}
        <div>
          <label className="block text-[10px] text-slate-500 mb-1">Protocol Name *</label>
          <input
            type="text"
            value={model.name}
            onChange={(e) => onModelChange({ name: e.target.value })}
            placeholder="e.g. code_review_protocol"
            className="w-full px-2 py-1.5 text-[11px] bg-slate-800/50 border border-slate-700/50 rounded text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-[10px] text-slate-500 mb-1">Description</label>
          <textarea
            value={model.description}
            onChange={(e) => onModelChange({ description: e.target.value })}
            placeholder="What does this protocol do?"
            rows={3}
            className="w-full px-2 py-1.5 text-[11px] bg-slate-800/50 border border-slate-700/50 rounded text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 resize-none"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-[10px] text-slate-500 mb-1">Category</label>
          <div className="flex gap-2">
            {(['business', 'system'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => onModelChange({ category: cat })}
                className={`flex-1 px-2 py-1.5 text-[10px] font-medium rounded border transition-colors ${
                  model.category === cat
                    ? cat === 'business'
                      ? 'bg-orange-950/30 border-orange-500/50 text-orange-400'
                      : 'bg-blue-950/30 border-blue-500/50 text-blue-400'
                    : 'border-slate-700 text-slate-500 hover:text-slate-400'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="bg-slate-800/30 rounded-md p-2 border border-slate-700/30 space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-500">States</span>
            <span className="text-slate-300 font-mono">{model.states.length}</span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-500">Transitions</span>
            <span className="text-slate-300 font-mono">{model.transitions.length}</span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-500">Notes bound</span>
            <span className="text-slate-300 font-mono">{model.notes.length}</span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-500">Entry state</span>
            <span className="text-slate-300 font-mono text-[9px]">
              {model.states.find((s) => s.state_type === 'start')?.name ?? '—'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-500">Terminal states</span>
            <span className="text-slate-300 font-mono text-[9px]">
              {model.states.filter((s) => s.state_type === 'terminal').map((s) => s.name).join(', ') || '—'}
            </span>
          </div>
        </div>

        {/* Created IDs */}
        {composedProtocolId && (
          <div className="bg-emerald-950/20 rounded-md p-2 border border-emerald-700/30 space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-emerald-500/70">Protocol</span>
              <span className="text-emerald-400 font-mono text-[9px] truncate ml-2">{composedProtocolId.slice(0, 8)}</span>
            </div>
            {composedSkillId && (
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-emerald-500/70">Skill</span>
                <span className="text-emerald-400 font-mono text-[9px] truncate ml-2">{composedSkillId.slice(0, 8)}</span>
              </div>
            )}
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-slate-700/50" />

        {/* TriggerBuilder — Relevance Vector */}
        <TriggerBuilder
          vector={relevanceVector}
          onChange={(v: RelevanceVector) => onModelChange({ relevance_vector: v })}
        />

        {/* Divider */}
        <div className="border-t border-slate-700/50" />

        {/* Simulate */}
        <div>
          <button
            onClick={onSimulate}
            disabled={simulating || !composedProtocolId}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-medium rounded border border-cyan-700/50 text-cyan-400 hover:bg-cyan-950/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title={!composedProtocolId ? 'Save protocol first to simulate' : undefined}
          >
            {simulating ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Zap size={12} />
            )}
            Test Activation
          </button>

          {!composedProtocolId && model.states.length > 0 && (
            <p className="text-[9px] text-slate-600 mt-1 text-center">
              Save protocol first to test activation
            </p>
          )}

          {simulateResult && (
            <div className="mt-2 space-y-2">
              {/* Radar chart */}
              {simulateResult.dimensions.length > 0 && (
                <div className="flex justify-center">
                  <ContextRadar
                    affinity={{ score: simulateResult.score, dimensions: simulateResult.dimensions, explanation: simulateResult.explanation }}
                    relevanceVector={relevanceVector}
                    size="sm"
                  />
                </div>
              )}

              {/* Result badge */}
              <div className={`rounded-md p-2 border text-[10px] ${
                simulateResult.would_activate
                  ? 'bg-emerald-950/20 border-emerald-700/30 text-emerald-400'
                  : 'bg-red-950/20 border-red-700/30 text-red-400'
              }`}>
                <div className="flex items-center gap-1.5 mb-1">
                  {simulateResult.would_activate ? <Check size={10} /> : <AlertCircle size={10} />}
                  <span className="font-medium">
                    {simulateResult.would_activate ? 'Would activate' : 'Would NOT activate'}
                  </span>
                  <span className="ml-auto font-mono">
                    {(simulateResult.score * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-[9px] text-slate-400 leading-relaxed">
                  {simulateResult.explanation}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Export JSON */}
        <button
          onClick={onExportJson}
          disabled={model.states.length === 0}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-medium rounded border border-slate-600/50 text-slate-400 hover:bg-slate-800/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Download size={12} />
          Export JSON
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// PATTERN COMPOSER
// ============================================================================

interface PatternComposerProps {
  projectId: string
  onComposed?: (protocolId: string, skillId: string) => void
}

function PatternComposerComponent({ projectId, onComposed }: PatternComposerProps) {
  const [model, setModel] = useState<ComposerModel>(createEmptyModel)
  const [noteMap, setNoteMap] = useState<Map<string, Note>>(new Map())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [simulateResult, setSimulateResult] = useState<SimulateResponse | null>(null)
  const [simulating, setSimulating] = useState(false)
  const [composedProtocolId, setComposedProtocolId] = useState<string | null>(null)
  const [composedSkillId, setComposedSkillId] = useState<string | null>(null)

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // Load notes into the map for previews
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const result = await notesApi.list({ project_id: projectId, limit: '200' } as Record<string, string>)
        if (!cancelled) {
          const map = new Map<string, Note>()
          for (const note of result.items) {
            map.set(note.id, note)
          }
          setNoteMap(map)
        }
      } catch (err) {
        console.error('[PatternComposer] failed to load notes:', err)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId])

  // Bound note IDs set
  const boundNoteIds = useMemo(
    () => new Set(model.notes.map((nb) => nb.note_id)),
    [model.notes]
  )

  // Model update helper
  const updateModel = useCallback((update: Partial<ComposerModel>) => {
    setModel((prev) => ({ ...prev, ...update }))
    setSaveSuccess(false)
    setSaveError(null)
  }, [])

  // DnD: note dropped on canvas
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || over.id !== 'fsm-canvas') return

      const dragData = active.data.current
      if (dragData?.type !== 'note') return

      const note = dragData.note as Note
      // If there are states, bind to the first one (user can re-bind later)
      // Otherwise just ignore the drop
      if (model.states.length === 0) return

      // Find the closest state to the drop position or bind to last state
      const targetState = model.states[model.states.length - 1]
      if (!targetState) return

      // Check if already bound
      if (model.notes.some((nb) => nb.note_id === note.id && nb.state_name === targetState.name)) return

      updateModel({
        notes: [...model.notes, { note_id: note.id, state_name: targetState.name }],
      })
    },
    [model.states, model.notes, updateModel]
  )

  // Handlers for FSMCanvas
  const handleStatesChange = useCallback(
    (states: ComposerState[]) => updateModel({ states }),
    [updateModel]
  )
  const handleTransitionsChange = useCallback(
    (transitions: ComposerTransition[]) => updateModel({ transitions }),
    [updateModel]
  )
  const handleNoteBindingsChange = useCallback(
    (notes: ComposerNoteBinding[]) => updateModel({ notes }),
    [updateModel]
  )
  const handleDeleteTransition = useCallback(
    (fromState: string, toState: string, trigger: string) => {
      updateModel({
        transitions: model.transitions.filter(
          (t) => !(t.from_state === fromState && t.to_state === toState && t.trigger === trigger)
        ),
      })
    },
    [model.transitions, updateModel]
  )

  // Save (compose)
  const handleSave = useCallback(async () => {
    if (!model.name.trim()) {
      setSaveError('Protocol name is required')
      return
    }
    if (model.states.length === 0) {
      setSaveError('At least one state is required')
      return
    }

    setSaving(true)
    setSaveError(null)
    try {
      const request: ComposeProtocolRequest = {
        project_id: projectId,
        name: model.name.trim(),
        description: model.description.trim() || undefined,
        category: model.category,
        notes: model.notes,
        states: model.states.map((s) => ({
          name: s.name,
          description: s.description,
          state_type: s.state_type,
          action: s.action,
        })),
        transitions: model.transitions,
        relevance_vector: model.relevance_vector,
        triggers: model.triggers.length > 0 ? model.triggers : undefined,
      }

      const result = await intelligenceApi.composeProtocol(request)
      setSaveSuccess(true)
      setComposedProtocolId(result.protocol_id)
      setComposedSkillId(result.skill_id)
      onComposed?.(result.protocol_id, result.skill_id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to compose protocol'
      setSaveError(msg)
    } finally {
      setSaving(false)
    }
  }, [model, projectId, onComposed])

  // Simulate (requires a saved protocol)
  const handleSimulate = useCallback(async () => {
    if (!composedProtocolId) return
    setSimulating(true)
    try {
      const result = await intelligenceApi.simulateProtocol({
        protocol_id: composedProtocolId,
        context: model.relevance_vector ?? DEFAULT_VECTOR,
      })
      setSimulateResult(result)
    } catch (err) {
      console.error('[PatternComposer] simulate error:', err)
      setSimulateResult({
        score: 0,
        dimensions: [],
        would_activate: false,
        explanation: err instanceof Error ? err.message : 'Simulation failed',
        context_used: model.relevance_vector ?? DEFAULT_VECTOR,
      })
    } finally {
      setSimulating(false)
    }
  }, [composedProtocolId, model.relevance_vector])

  // Export model as JSON (for compose endpoint or SkillPackage)
  const handleExportJson = useCallback(() => {
    const exportData: ComposeProtocolRequest = {
      project_id: projectId,
      name: model.name.trim(),
      description: model.description.trim() || undefined,
      category: model.category,
      notes: model.notes,
      states: model.states.map((s) => ({
        name: s.name,
        description: s.description,
        state_type: s.state_type,
        action: s.action,
      })),
      transitions: model.transitions,
      relevance_vector: model.relevance_vector,
      triggers: model.triggers.length > 0 ? model.triggers : undefined,
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${model.name.trim().replace(/\s+/g, '_') || 'protocol'}.compose.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [model, projectId])

  // Validation
  const isValid = model.name.trim().length > 0 && model.states.length > 0

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex h-full bg-slate-950">
        {/* Left Panel — NotePool */}
        <div className="w-64 shrink-0 border-r border-slate-700/50 bg-slate-900/50">
          <NotePool projectId={projectId} boundNoteIds={boundNoteIds} />
        </div>

        {/* Center — FSM Canvas */}
        <div className="flex-1 relative">
          <ReactFlowProvider>
            <FSMCanvas
              states={model.states}
              transitions={model.transitions}
              noteBindings={model.notes}
              noteMap={noteMap}
              onStatesChange={handleStatesChange}
              onTransitionsChange={handleTransitionsChange}
              onNoteBindingsChange={handleNoteBindingsChange}
              onDeleteTransition={handleDeleteTransition}
            />
          </ReactFlowProvider>

          {/* Top bar with save button */}
          <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
            {saveError && (
              <div className="flex items-center gap-1 px-2 py-1 text-[10px] text-red-400 bg-red-950/50 border border-red-800/30 rounded">
                <AlertCircle size={10} />
                {saveError}
              </div>
            )}
            {saveSuccess && (
              <div className="flex items-center gap-1 px-2 py-1 text-[10px] text-emerald-400 bg-emerald-950/50 border border-emerald-800/30 rounded">
                <Check size={10} />
                Protocol created!
              </div>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !isValid}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg"
            >
              {saving ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Save size={12} />
              )}
              Compose
            </button>
          </div>
        </div>

        {/* Right Panel — Properties */}
        <div className="w-56 shrink-0 border-l border-slate-700/50 bg-slate-900/50">
          <PropertiesPanel
            model={model}
            onModelChange={updateModel}
            simulateResult={simulateResult}
            simulating={simulating}
            onSimulate={handleSimulate}
            onExportJson={handleExportJson}
            composedProtocolId={composedProtocolId}
            composedSkillId={composedSkillId}
          />
        </div>
      </div>
    </DndContext>
  )
}

export const PatternComposer = memo(PatternComposerComponent)
