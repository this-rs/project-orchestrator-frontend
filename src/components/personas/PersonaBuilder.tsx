import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wand2, FileCode, Network, Hand, ArrowRight, ArrowLeft, Check } from 'lucide-react'
import { personasApi } from '@/services'
import { Button, EntityList, EntityRow, Input, Select, Textarea } from '@/components/ui'
import { useToast, useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import { useT, type MessageKey } from '@/i18n'
import type { PersonaProposal } from '@/types'

type Translate = ReturnType<typeof useT>['t']
type Noun = 'file' | 'note' | 'decision' | 'protocol' | 'skill' | 'synapse' | 'member' | 'activation' | 'import' | 'publishedSkill' | 'day' | 'hop'
/** `1 file` / `2 files`, from the `nouns` keys. */
const count = (t: Translate, n: number, noun: Noun) => t(`siteSkills.nouns.${noun}.${n === 1 ? 'one' : 'other'}`, { count: n })

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

/**
 * The manual mode comes first: it is the only one that needs no code, so it is
 * the one every project can use (a project with no code has neither an entry
 * point nor a code community). The code-based modes follow.
 */
const modes: { key: BuildMode; labelKey: MessageKey; descriptionKey: MessageKey; icon: React.ElementType }[] = [
  { key: 'manual', labelKey: 'siteSkills.personaBuilder.modes.manual.label', descriptionKey: 'siteSkills.personaBuilder.modes.manual.description', icon: Hand },
  { key: 'entry_point', labelKey: 'siteSkills.personaBuilder.modes.entryPoint.label', descriptionKey: 'siteSkills.personaBuilder.modes.entryPoint.description', icon: Wand2 },
  { key: 'file_pattern', labelKey: 'siteSkills.personaBuilder.modes.filePattern.label', descriptionKey: 'siteSkills.personaBuilder.modes.filePattern.description', icon: FileCode },
  { key: 'community', labelKey: 'siteSkills.personaBuilder.modes.community.label', descriptionKey: 'siteSkills.personaBuilder.modes.community.description', icon: Network },
]

const STEPS: MessageKey[] = [
  'siteSkills.personaBuilder.steps.mode',
  'siteSkills.personaBuilder.steps.configure',
  'siteSkills.personaBuilder.steps.preview',
  'siteSkills.personaBuilder.steps.create',
]

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
  const { t } = useT()

  const update = (partial: Partial<WizardState>) => setState((prev) => ({ ...prev, ...partial }))
  const modeLabel = modes.find((m) => m.key === state.mode)?.labelKey

  const handlePreview = async () => {
    update({ loadingPreview: true })
    try {
      const result = await personasApi.detect(projectId)
      update({ proposals: result.proposals || [], loadingPreview: false, step: 2 })
    } catch {
      toast.error(t('siteSkills.personaBuilder.toast.previewFailed'))
      update({ loadingPreview: false })
    }
  }

  const handleCreate = async () => {
    if (!state.name.trim()) {
      toast.error(t('siteSkills.personaBuilder.toast.nameRequired'))
      return
    }
    if (!projectId) {
      toast.error(t('siteSkills.personaBuilder.toast.chooseProject'))
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
      toast.success(t('siteSkills.personaBuilder.toast.created', { name: state.name }))
      navigate(workspacePath(wsSlug, `/personas/${persona.id}`))
      onClose()
    } catch {
      toast.error(t('siteSkills.personaBuilder.toast.createFailed'))
    } finally {
      setCreating(false)
    }
  }

  const back = (step: WizardState['step']) => (
    <Button variant="ghost" size="sm" onClick={() => update({ step })}>
      <ArrowLeft className="w-4 h-4 mr-1" aria-hidden="true" />
      {t('siteSkills.personaBuilder.back')}
    </Button>
  )

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" aria-label={t('siteSkills.personaBuilder.stepsLabel')}>
        {STEPS.map((labelKey, i) => {
          const done = state.step > i
          const current = state.step === i
          return (
            <li key={labelKey} className="flex items-center gap-2" aria-current={current ? 'step' : undefined}>
              {i > 0 && <span className="h-px w-4 bg-white/[0.1]" aria-hidden="true" />}
              <span className={`inline-flex items-center gap-1 ${current ? 'text-indigo-300' : done ? 'text-emerald-400' : 'text-gray-500'}`}>
                {done ? <Check className="w-3 h-3" aria-hidden="true" /> : <span className="tabular-nums">{i + 1}</span>}
                {t(labelKey)}
              </span>
            </li>
          )
        })}
      </ol>

      {/* Step 0: mode — one row per option (no cards), chevron = drill-down */}
      {state.step === 0 && (
        <EntityList aria-label={t('siteSkills.personaBuilder.buildMode')}>
          {modes.map(({ key, labelKey, descriptionKey, icon: ModeIcon }) => (
            <EntityRow
              key={key}
              title={t(labelKey)}
              description={t(descriptionKey)}
              onClick={() => update({ mode: key, step: 1 })}
              selected={state.mode === key}
              leading={<ModeIcon className="w-4 h-4 text-indigo-400" aria-hidden="true" />}
              chevron
            />
          ))}
        </EntityList>
      )}

      {/* Step 1: configure */}
      {state.step === 1 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-200">
            {t('siteSkills.personaBuilder.configureTitle', { mode: modeLabel ? t(modeLabel) : '' })}
          </h3>

          {state.mode === 'entry_point' && (
            <>
              <Input
                label={t('siteSkills.personaBuilder.entryFunction')}
                value={state.entryFunction}
                onChange={(e) => update({ entryFunction: e.target.value })}
                placeholder={t('siteSkills.personaBuilder.entryFunctionPlaceholder')}
              />
              <Input
                label={t('siteSkills.personaBuilder.traversalDepth')}
                type="number"
                min={1}
                max={10}
                value={state.depth}
                onChange={(e) => update({ depth: Number(e.target.value) })}
              />
            </>
          )}

          {state.mode === 'file_pattern' && (
            <Input
              label={t('siteSkills.personaBuilder.globPattern')}
              className="font-mono"
              value={state.filePattern}
              onChange={(e) => update({ filePattern: e.target.value })}
              placeholder={t('siteSkills.personaBuilder.globPlaceholder')}
            />
          )}

          {state.mode === 'community' && (
            <div>
              <Input
                label={t('siteSkills.personaBuilder.communityId')}
                value={state.communityId}
                onChange={(e) => update({ communityId: e.target.value })}
                placeholder={t('siteSkills.personaBuilder.communityIdPlaceholder')}
              />
              <p className="mt-1 text-xs text-gray-500">{t('siteSkills.personaBuilder.communityHint')}</p>
            </div>
          )}

          {state.mode === 'manual' && (
            <p className="text-sm text-gray-400">{t('siteSkills.personaBuilder.manualHint')}</p>
          )}

          <div className="flex flex-wrap justify-between gap-2 pt-1">
            {back(0)}
            <Button
              size="sm"
              onClick={() => (state.mode === 'manual' ? update({ step: 3 }) : handlePreview())}
              loading={state.loadingPreview}
            >
              {state.mode === 'manual' ? t('siteSkills.personaBuilder.skipToCreate') : t('siteSkills.personaBuilder.preview')}
              <ArrowRight className="w-4 h-4 ml-1" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: preview */}
      {state.step === 2 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-200">{t('siteSkills.personaBuilder.proposalsTitle')}</h3>
          <p className="text-xs text-gray-500">{t('siteSkills.personaBuilder.proposalsHint')}</p>
          {state.proposals.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">{t('siteSkills.personaBuilder.noProposals')}</p>
          ) : (
            <EntityList aria-label={t('siteSkills.personaBuilder.proposalsLabel')}>
              {state.proposals.map((p, i) => (
                <EntityRow
                  key={`${p.community_id}-${i}`}
                  title={p.suggested_name}
                  onClick={() => update({ name: p.suggested_name, step: 3 })}
                  trailing={<span title={t('siteSkills.personaBuilder.confidence')}>{(p.confidence * 100).toFixed(0)}%</span>}
                  meta={[
                    count(t, p.file_count, 'file'),
                    t('siteSkills.personaBuilder.community', { id: p.community_id }),
                  ]}
                  context={
                    p.sample_files?.length > 0 ? (
                      <p className="text-[11px] leading-4 text-gray-500 font-mono break-all" title={p.sample_files.join('\n')}>
                        {p.sample_files.slice(0, 3).join(', ')}
                        {p.sample_files.length > 3 && ` ${t('siteSkills.common.more', { count: p.sample_files.length - 3 })}`}
                      </p>
                    ) : undefined
                  }
                  chevron
                />
              ))}
            </EntityList>
          )}
          <div className="flex flex-wrap justify-between gap-2 pt-1">
            {back(1)}
            <Button size="sm" onClick={() => update({ step: 3 })}>
              {t('siteSkills.personaBuilder.continue')}
              <ArrowRight className="w-4 h-4 ml-1" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: create */}
      {state.step === 3 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-200">{t('siteSkills.personaBuilder.createTitle')}</h3>
          {projects.length > 1 && (
            <Select
              label={t('siteSkills.personaBuilder.projectField')}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              value={projectId}
              onChange={setProjectId}
            />
          )}
          <Input
            label={t('siteSkills.personaBuilder.nameField')}
            value={state.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder={t('siteSkills.personaBuilder.namePlaceholder')}
          />
          <Textarea
            label={t('siteSkills.personaBuilder.descriptionField')}
            rows={3}
            value={state.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder={t('siteSkills.personaBuilder.descriptionPlaceholder')}
          />
          <div className="flex flex-wrap justify-between gap-2 pt-1">
            {back(state.mode === 'manual' ? 1 : 2)}
            <Button size="sm" onClick={handleCreate} loading={creating}>
              {!creating && <Check className="w-4 h-4 mr-1" aria-hidden="true" />}
              {t('siteSkills.personaBuilder.createButton')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
