import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wand2, FileCode, Network, Hand, ArrowRight, ArrowLeft, Check } from 'lucide-react'
import { personasApi } from '@/services'
import { Button, Card, CardContent } from '@/components/ui'
import { useToast, useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import type { PersonaProposal } from '@/types'

// ── Types ────────────────────────────────────────────────────────────────

type BuildMode = 'entry_point' | 'file_pattern' | 'community' | 'manual'

interface WizardState {
  step: 0 | 1 | 2 | 3
  mode: BuildMode | null
  // Mode-specific inputs
  entryFunction: string
  depth: number
  filePattern: string
  communityId: string
  // Preview
  proposals: PersonaProposal[]
  loadingPreview: boolean
  // Config
  name: string
  description: string
}

const initialState: WizardState = {
  step: 0,
  mode: null,
  entryFunction: '',
  depth: 3,
  filePattern: '',
  communityId: '',
  proposals: [],
  loadingPreview: false,
  name: '',
  description: '',
}

// ── Mode cards ──────────────────────────────────────────────────────────

const modes: { key: BuildMode; label: string; description: string; icon: React.ElementType }[] = [
  { key: 'entry_point', label: 'From Entry Point', description: 'Start from a function and traverse its call graph', icon: Wand2 },
  { key: 'file_pattern', label: 'From File Pattern', description: 'Match files with a glob pattern (e.g. src/api/**/*.rs)', icon: FileCode },
  { key: 'community', label: 'From Community', description: 'Use a detected code community cluster', icon: Network },
  { key: 'manual', label: 'Manual', description: 'Start empty and add entities manually', icon: Hand },
]

// ── Component ───────────────────────────────────────────────────────────

interface PersonaBuilderProps {
  projectId: string
  onClose: () => void
}

export function PersonaBuilder({ projectId, onClose }: PersonaBuilderProps) {
  const [state, setState] = useState<WizardState>(initialState)
  const [creating, setCreating] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()
  const wsSlug = useWorkspaceSlug()

  const update = (partial: Partial<WizardState>) => setState((prev) => ({ ...prev, ...partial }))

  const handlePreview = async () => {
    update({ loadingPreview: true })
    try {
      const result = await personasApi.detect(projectId)
      update({ proposals: result.proposals || [], loadingPreview: false, step: 2 })
    } catch {
      toast.error('Failed to generate preview')
      update({ loadingPreview: false })
    }
  }

  const handleCreate = async () => {
    if (!state.name.trim()) {
      toast.error('Name is required')
      return
    }
    setCreating(true)
    try {
      if (state.mode === 'manual') {
        const persona = await personasApi.create({
          project_id: projectId,
          name: state.name,
          description: state.description,
        })
        toast.success(`Persona "${state.name}" created`)
        navigate(workspacePath(wsSlug, `/personas/${persona.id}`))
      } else {
        // Auto-build with the selected mode
        const persona = await personasApi.autoBuild({
          project_id: projectId,
          name: state.name,
          description: state.description,
          entry_function: state.mode === 'entry_point' ? state.entryFunction : undefined,
          depth: state.mode === 'entry_point' ? state.depth : undefined,
          file_pattern: state.mode === 'file_pattern' ? state.filePattern : state.mode === 'community' ? state.communityId : undefined,
        })
        toast.success(`Persona "${state.name}" created`)
        navigate(workspacePath(wsSlug, `/personas/${persona.id}`))
      }
      onClose()
    } catch {
      toast.error('Failed to create persona')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {['Mode', 'Configure', 'Preview', 'Create'].map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            {i > 0 && <div className="h-px w-6 bg-zinc-700" />}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              state.step === i
                ? 'bg-indigo-500/20 text-indigo-400'
                : state.step > i
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-zinc-800 text-zinc-500'
            }`}>
              {state.step > i ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>}
              <span className="hidden sm:inline">{label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Step 0: Choose mode */}
      {state.step === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {modes.map(({ key, label, description, icon: ModeIcon }) => (
            <button
              key={key}
              onClick={() => update({ mode: key, step: 1 })}
              className={`text-left p-4 rounded-lg border transition-colors ${
                state.mode === key
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-800/50'
              }`}
            >
              <ModeIcon className="h-5 w-5 mb-2 text-indigo-400" />
              <div className="font-medium text-sm">{label}</div>
              <div className="text-xs text-zinc-500 mt-1">{description}</div>
            </button>
          ))}
        </div>
      )}

      {/* Step 1: Mode-specific configuration */}
      {state.step === 1 && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <h3 className="text-sm font-medium text-zinc-300">
              Configure — {modes.find((m) => m.key === state.mode)?.label}
            </h3>

            {state.mode === 'entry_point' && (
              <>
                <div>
                  <label className="text-xs text-zinc-500">Entry Function</label>
                  <input
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm mt-1"
                    value={state.entryFunction}
                    onChange={(e) => update({ entryFunction: e.target.value })}
                    placeholder="e.g. handle_request, main, process_event"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Traversal Depth</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm mt-1"
                    value={state.depth}
                    onChange={(e) => update({ depth: Number(e.target.value) })}
                  />
                </div>
              </>
            )}

            {state.mode === 'file_pattern' && (
              <div>
                <label className="text-xs text-zinc-500">Glob Pattern</label>
                <input
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm mt-1"
                  value={state.filePattern}
                  onChange={(e) => update({ filePattern: e.target.value })}
                  placeholder="e.g. src/api/**/*.rs, src/services/*.ts"
                />
              </div>
            )}

            {state.mode === 'community' && (
              <div>
                <label className="text-xs text-zinc-500">Community ID</label>
                <input
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm mt-1"
                  value={state.communityId}
                  onChange={(e) => update({ communityId: e.target.value })}
                  placeholder="Community ID from code analysis"
                />
                <p className="text-xs text-zinc-600 mt-1">
                  Run community detection from the Code page to see available clusters.
                </p>
              </div>
            )}

            {state.mode === 'manual' && (
              <p className="text-sm text-zinc-500">
                A manual persona starts empty. You can add files, notes, and skills after creation.
              </p>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="ghost" size="sm" onClick={() => update({ step: 0 })}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  if (state.mode === 'manual') {
                    update({ step: 3 })
                  } else {
                    handlePreview()
                  }
                }}
                loading={state.loadingPreview}
              >
                {state.mode === 'manual' ? 'Skip to Create' : 'Preview'}
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Preview */}
      {state.step === 2 && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <h3 className="text-sm font-medium text-zinc-300">Preview — Detected Proposals</h3>
            {state.proposals.length === 0 ? (
              <p className="text-sm text-zinc-500 py-4 text-center">
                No proposals detected. Try a different configuration or create manually.
              </p>
            ) : (
              <div className="space-y-2">
                {state.proposals.map((p, i) => (
                  <div key={i} className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{p.suggested_name}</span>
                      <span className="text-xs text-zinc-500">
                        {p.file_count} files · {(p.confidence * 100).toFixed(0)}% confidence
                      </span>
                    </div>
                    {p.sample_files && p.sample_files.length > 0 && (
                      <div className="text-xs text-zinc-600 font-mono mt-1">
                        {p.sample_files.slice(0, 3).join(', ')}
                        {p.sample_files.length > 3 && ` +${p.sample_files.length - 3} more`}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between pt-2">
              <Button variant="ghost" size="sm" onClick={() => update({ step: 1 })}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button size="sm" onClick={() => update({ step: 3 })}>
                Configure
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Final config + create */}
      {state.step === 3 && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <h3 className="text-sm font-medium text-zinc-300">Create Persona</h3>
            <div>
              <label className="text-xs text-zinc-500">Name *</label>
              <input
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm mt-1"
                value={state.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="e.g. API Layer Expert, Auth Module"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Description</label>
              <textarea
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm h-20 mt-1"
                value={state.description}
                onChange={(e) => update({ description: e.target.value })}
                placeholder="What this persona specializes in..."
              />
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" size="sm" onClick={() => update({ step: state.mode === 'manual' ? 1 : 2 })}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button size="sm" onClick={handleCreate} loading={creating}>
                <Check className="h-4 w-4 mr-1" />
                Create Persona
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
