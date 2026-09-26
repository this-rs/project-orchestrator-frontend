import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wand2, FileCode, Network, Hand, ArrowRight, ArrowLeft, Check } from 'lucide-react'
import { personasApi } from '@/services'
import { Button, Input, Select, Textarea, MetaLine, focusRing } from '@/components/ui'
import { useToast, useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import type { PersonaProposal } from '@/types'

// ── Types ────────────────────────────────────────────────────────────────

type BuildMode = 'entry_point' | 'file_pattern' | 'community' | 'manual'

interface WizardState {
  step: 0 | 1 | 2 | 3
  mode: BuildMode | null
  entryFunction: string
  depth: number
  filePattern: string
  communityId: string
  proposals: PersonaProposal[]
  loadingPreview: boolean
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

// ── Modes ────────────────────────────────────────────────────────────────

const modes: { key: BuildMode; label: string; description: string; icon: React.ElementType }[] = [
  { key: 'entry_point', label: 'From an entry point', description: 'Start from a function and follow its call graph.', icon: Wand2 },
  { key: 'file_pattern', label: 'From a file pattern', description: 'Match files with a glob (e.g. src/api/**/*.rs).', icon: FileCode },
  { key: 'community', label: 'From a code community', description: 'Use a cluster detected by code analysis.', icon: Network },
  { key: 'manual', label: 'Manual', description: 'Start empty and link files, notes and skills later.', icon: Hand },
]

const STEPS = ['Mode', 'Configure', 'Preview', 'Create']

// ── Component ───────────────────────────────────────────────────────────

interface PersonaBuilderProps {
  /** Default destination project */
  projectId: string
  /** Candidate projects — a selector is shown on the last step when > 1 */
  projects?: { id: string; name: string }[]
  onClose: () => void
}

export function PersonaBuilder({ projectId: defaultProjectId, projects = [], onClose }: PersonaBuilderProps) {
  const [state, setState] = useState<WizardState>(initialState)
  const [projectId, setProjectId] = useState(defaultProjectId)
  const [creating, setCreating] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()
  const wsSlug = useWorkspaceSlug()

  const update = (partial: Partial<WizardState>) => setState((prev) => ({ ...prev, ...partial }))
  const modeLabel = modes.find((m) => m.key === state.mode)?.label

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
    if (!projectId) {
      toast.error('Choose a project')
      return
    }
    setCreating(true)
    try {
      const persona =
        state.mode === 'manual'
          ? await personasApi.create({ project_id: projectId, name: state.name, description: state.description })
          : await personasApi.autoBuild({
              project_id: projectId,
              name: state.name,
              description: state.description,
              entry_function: state.mode === 'entry_point' ? state.entryFunction : undefined,
              depth: state.mode === 'entry_point' ? state.depth : undefined,
              file_pattern:
                state.mode === 'file_pattern' ? state.filePattern : state.mode === 'community' ? state.communityId : undefined,
            })
      toast.success(`Persona “${state.name}” created`)
      navigate(workspacePath(wsSlug, `/personas/${persona.id}`))
      onClose()
    } catch {
      toast.error('Failed to create persona')
    } finally {
      setCreating(false)
    }
  }

  const back = (step: WizardState['step']) => (
    <Button variant="ghost" size="sm" onClick={() => update({ step })}>
      <ArrowLeft className="w-4 h-4 mr-1" aria-hidden="true" />
      Back
    </Button>
  )

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" aria-label="Steps">
        {STEPS.map((label, i) => {
          const done = state.step > i
          const current = state.step === i
          return (
            <li key={label} className="flex items-center gap-2" aria-current={current ? 'step' : undefined}>
              {i > 0 && <span className="h-px w-4 bg-white/[0.1]" aria-hidden="true" />}
              <span className={`inline-flex items-center gap-1 ${current ? 'text-indigo-300' : done ? 'text-emerald-400' : 'text-gray-500'}`}>
                {done ? <Check className="w-3 h-3" aria-hidden="true" /> : <span className="tabular-nums">{i + 1}</span>}
                {label}
              </span>
            </li>
          )
        })}
      </ol>

      {/* Step 0: mode */}
      {state.step === 0 && (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {modes.map(({ key, label, description, icon: ModeIcon }) => (
            <li key={key}>
              <button
                type="button"
                onClick={() => update({ mode: key, step: 1 })}
                aria-pressed={state.mode === key}
                className={`w-full h-full text-left flex items-start gap-3 rounded-xl border px-3 py-3 transition-colors ${focusRing} ${
                  state.mode === key
                    ? 'border-indigo-500/60 bg-indigo-500/[0.08]'
                    : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                }`}
              >
                <ModeIcon className="w-4 h-4 mt-0.5 shrink-0 text-indigo-400" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm text-gray-200">{label}</span>
                  <span className="block mt-0.5 text-xs text-gray-500">{description}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Step 1: configure */}
      {state.step === 1 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-200">Configure — {modeLabel}</h3>

          {state.mode === 'entry_point' && (
            <>
              <Input
                label="Entry function"
                className="text-base md:text-sm"
                value={state.entryFunction}
                onChange={(e) => update({ entryFunction: e.target.value })}
                placeholder="e.g. handle_request, main"
              />
              <Input
                label="Traversal depth"
                type="number"
                min={1}
                max={10}
                className="text-base md:text-sm"
                value={state.depth}
                onChange={(e) => update({ depth: Number(e.target.value) })}
              />
            </>
          )}

          {state.mode === 'file_pattern' && (
            <Input
              label="Glob pattern"
              className="text-base md:text-sm font-mono"
              value={state.filePattern}
              onChange={(e) => update({ filePattern: e.target.value })}
              placeholder="e.g. src/api/**/*.rs"
            />
          )}

          {state.mode === 'community' && (
            <div>
              <Input
                label="Community ID"
                className="text-base md:text-sm"
                value={state.communityId}
                onChange={(e) => update({ communityId: e.target.value })}
                placeholder="Community ID from code analysis"
              />
              <p className="mt-1 text-xs text-gray-500">Run community detection from the Code page to see available clusters.</p>
            </div>
          )}

          {state.mode === 'manual' && (
            <p className="text-sm text-gray-400">A manual persona starts empty. Link files, notes and skills after creation.</p>
          )}

          <div className="flex flex-wrap justify-between gap-2 pt-1">
            {back(0)}
            <Button
              size="sm"
              onClick={() => (state.mode === 'manual' ? update({ step: 3 }) : handlePreview())}
              loading={state.loadingPreview}
            >
              {state.mode === 'manual' ? 'Skip to create' : 'Preview'}
              <ArrowRight className="w-4 h-4 ml-1" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: preview */}
      {state.step === 2 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-200">Detected proposals</h3>
          <p className="text-xs text-gray-500">Tap a proposal to reuse its suggested name.</p>
          {state.proposals.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">No proposal detected. Try another configuration or create manually.</p>
          ) : (
            <ul className="rounded-xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.05] overflow-hidden">
              {state.proposals.map((p, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => update({ name: p.suggested_name, step: 3 })}
                    className={`w-full text-left px-3 py-2.5 hover:bg-white/[0.03] ${focusRing}`}
                  >
                    <span className="block text-sm text-gray-200 break-words">{p.suggested_name}</span>
                    <MetaLine
                      className="mt-0.5"
                      items={[
                        `${p.file_count} files`,
                        `${(p.confidence * 100).toFixed(0)}% confidence`,
                        `community ${p.community_id}`,
                      ]}
                    />
                    {p.sample_files?.length > 0 && (
                      <span className="block mt-0.5 text-[11px] text-gray-500 font-mono break-all">
                        {p.sample_files.slice(0, 3).join(', ')}
                        {p.sample_files.length > 3 && ` +${p.sample_files.length - 3} more`}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap justify-between gap-2 pt-1">
            {back(1)}
            <Button size="sm" onClick={() => update({ step: 3 })}>
              Continue
              <ArrowRight className="w-4 h-4 ml-1" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: create */}
      {state.step === 3 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-200">Create persona</h3>
          {projects.length > 1 && (
            <Select
              label="Project"
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              value={projectId}
              onChange={setProjectId}
            />
          )}
          <Input
            label="Name *"
            className="text-base md:text-sm"
            value={state.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="e.g. API layer expert"
          />
          <Textarea
            label="Description"
            className="text-base md:text-sm"
            rows={3}
            value={state.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="What this persona specialises in…"
          />
          <div className="flex flex-wrap justify-between gap-2 pt-1">
            {back(state.mode === 'manual' ? 1 : 2)}
            <Button size="sm" onClick={handleCreate} loading={creating}>
              {!creating && <Check className="w-4 h-4 mr-1" aria-hidden="true" />}
              Create persona
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
