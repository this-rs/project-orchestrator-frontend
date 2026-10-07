import { useState } from 'react'
import { Badge, Button, Input } from '@/components/ui'
import { useRoutingSettings } from '@/hooks/useRoutingSettings'
import { useT } from '@/i18n'
import { ApiError } from '@/services/api'
import { routingErrorCode } from '@/services/routing'
import {
  LEARNING_STAGES,
  ROUTING_MODES,
  type LearningStage,
  type ProviderRoutingMode,
  type RoutingScope,
  type RoutingSettings as Settings,
  type RoutingSettingsResponse,
} from '@/types/routing'
import { RoutingDecisionsTable } from './RoutingDecisionsTable'
import { ShadowReportCard } from './ShadowReportCard'
import { ConfirmPanel } from './ConfirmPanel'
import { ChoiceRow, FIELD_LABEL, FormField } from './FormField'
import { ErrorLine, Loading, Panel, ProjectPicker, SaveStatus } from './SettingsPanel'
import { useProjectOptions } from './useProjectOptions'

/** Bounds enforced client-side (the backend refuses anything else with `invalid_routing_weight`). */
const ROUTING_BOUNDS = {
  exploration_epsilon: { min: 0, max: 0.25, step: 0.01 },
  cost_weight: { min: 0, max: 1, step: 0.05 },
  latency_weight: { min: 0, max: 1, step: 0.05 },
} as const
type NumericField = keyof typeof ROUTING_BOUNDS
const NUMERIC_FIELDS = Object.keys(ROUTING_BOUNDS) as NumericField[]

/** Stages after which PO starts applying (or proposing) its own choices. */
const needsConfirmation = (from: LearningStage, to: LearningStage) =>
  from === 'shadow' && (to === 'auto' || to === 'advisory')

const SCOPE_VARIANT: Record<RoutingScope, 'info' | 'success' | 'default'> = {
  global: 'info',
  project: 'success',
  default: 'default',
}

/** Parse a field's text; `null` when it is not a finite number or out of its bounds. */
function parseBounded(field: NumericField, raw: string): number | null {
  if (raw.trim() === '') return null
  const n = Number(raw.replace(',', '.'))
  const { min, max } = ROUTING_BOUNDS[field]
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}

interface EditorProps {
  settings: RoutingSettingsResponse
  saveLabel: string
  doneText: string
  onSave: (settings: Settings) => Promise<unknown>
  testId: string
}

/** The form: mode cards, learning stage, tuning. Saved with `onSave`; the stage change asks first. */
function RoutingEditor({ settings, saveLabel, doneText, onSave, testId }: EditorProps) {
  const { t } = useT()
  const [mode, setMode] = useState<ProviderRoutingMode>(settings.mode)
  const [stage, setStage] = useState<LearningStage>(settings.stage)
  const [text, setText] = useState<Record<NumericField, string>>({
    exploration_epsilon: String(settings.exploration_epsilon),
    cost_weight: String(settings.cost_weight),
    latency_weight: String(settings.latency_weight),
  })
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const touch = () => setDone(false)
  const labels: Record<NumericField, string> = {
    exploration_epsilon: t('routing.settings.epsilon'),
    cost_weight: t('routing.settings.costWeight'),
    latency_weight: t('routing.settings.latencyWeight'),
  }
  const helps: Record<NumericField, string> = {
    exploration_epsilon: t('routing.settings.epsilonHelp'),
    cost_weight: t('routing.settings.costWeightHelp'),
    latency_weight: t('routing.settings.latencyWeightHelp'),
  }
  const fieldError = (f: NumericField) =>
    parseBounded(f, text[f]) === null
      ? t('routing.settings.errors.bounds', {
          label: labels[f],
          min: ROUTING_BOUNDS[f].min,
          max: ROUTING_BOUNDS[f].max,
        })
      : null
  const invalid = NUMERIC_FIELDS.some((f) => fieldError(f) !== null)

  const errorMessage = (err: unknown): string => {
    const code = routingErrorCode(err)
    if (code === 'invalid_routing_mode') return t('routing.settings.errors.invalid_routing_mode')
    if (code === 'invalid_learning_stage') return t('routing.settings.errors.invalid_learning_stage')
    if (code === 'invalid_routing_weight') return t('routing.settings.errors.invalid_routing_weight')
    if (err instanceof ApiError && err.status === 403) return t('routing.settings.errors.forbidden')
    return t('routing.settings.errors.generic')
  }

  const doSave = async () => {
    setBusy(true)
    setError(null)
    try {
      await onSave({
        mode,
        stage,
        primary: settings.primary,
        exploration_epsilon: parseBounded('exploration_epsilon', text.exploration_epsilon) ?? 0,
        cost_weight: parseBounded('cost_weight', text.cost_weight) ?? 0,
        latency_weight: parseBounded('latency_weight', text.latency_weight) ?? 0,
        demote_after: settings.demote_after,
      })
      setDone(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  const onSaveClick = () => {
    if (invalid) return
    if (needsConfirmation(settings.stage, stage)) {
      setConfirming(true)
      return
    }
    void doSave()
  }

  return (
    <Panel
      testId={testId}
      status={<SaveStatus error={error} done={done} doneText={doneText} />}
      actions={
        <Button size="sm" variant="primary" onClick={onSaveClick} loading={busy} disabled={invalid}>
          {saveLabel}
        </Button>
      }
    >
      <fieldset>
        <legend className={FIELD_LABEL}>{t('routing.settings.modeLegend')}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {ROUTING_MODES.map((m) => (
            <ChoiceRow
              key={m}
              name={`${testId}-mode`}
              value={m}
              checked={mode === m}
              onChange={(v) => {
                setMode(v as ProviderRoutingMode)
                touch()
              }}
              title={t(`routing.modes.${m}.label`)}
              description={t(`routing.modes.${m}.description`)}
            />
          ))}
        </div>
      </fieldset>

      <div>
        <span id={`${testId}-stage-label`} className={FIELD_LABEL}>
          {t('routing.settings.stageLegend')}
        </span>
        <div
          role="radiogroup"
          aria-labelledby={`${testId}-stage-label`}
          className="grid gap-px overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.08] sm:grid-cols-3"
        >
          {LEARNING_STAGES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={stage === s}
              onClick={() => {
                setStage(s)
                setConfirming(false)
                touch()
              }}
              className={`px-3 py-2 text-left ${
                stage === s ? 'bg-indigo-500/20 text-gray-100' : 'bg-surface-base text-gray-400 hover:bg-white/[0.04]'
              }`}
            >
              <span className="block text-sm font-medium">{t(`routing.stages.${s}.label`)}</span>
              <span className="mt-0.5 block text-xs text-gray-500">{t(`routing.stages.${s}.description`)}</span>
            </button>
          ))}
        </div>
      </div>

      <fieldset>
        <legend className={FIELD_LABEL}>{t('routing.settings.tuningLegend')}</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          {NUMERIC_FIELDS.map((f) => {
            const id = `${testId}-${f}`
            const b = ROUTING_BOUNDS[f]
            return (
              <FormField key={f} id={id} label={labels[f]} help={helps[f]} error={fieldError(f)}>
                <Input
                  id={id}
                  type="number"
                  inputMode="decimal"
                  min={b.min}
                  max={b.max}
                  step={b.step}
                  value={text[f]}
                  aria-invalid={fieldError(f) !== null || undefined}
                  onChange={(e) => {
                    setText((s) => ({ ...s, [f]: e.target.value }))
                    touch()
                  }}
                />
              </FormField>
            )
          })}
        </div>
      </fieldset>

      {confirming && (
        <ConfirmPanel
          title={t('routing.settings.confirmTitle')}
          confirmLabel={t('routing.settings.confirmYes')}
          cancelLabel={t('routing.settings.cancel')}
          onConfirm={doSave}
          onCancel={() => setConfirming(false)}
        >
          <p>{stage === 'auto' ? t('routing.settings.confirmAuto') : t('routing.settings.confirmAdvisory')}</p>
        </ConfirmPanel>
      )}
    </Panel>
  )
}

function ScopeBadge({ scope }: { scope: RoutingScope }) {
  const { t } = useT()
  return (
    <span className="inline-flex items-center gap-2 text-xs text-gray-400" data-testid="routing-scope">
      {t('routing.settings.scopeLabel')}
      <Badge variant={SCOPE_VARIANT[scope]}>{t(`routing.settings.scope.${scope}`)}</Badge>
    </span>
  )
}

function GlobalRouting() {
  const { t } = useT()
  const state = useRoutingSettings(null)
  const { settings } = state
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-100">{t('routing.settings.globalTitle')}</h3>
      {state.loading && <Loading>{t('routing.settings.loading')}</Loading>}
      {state.unavailable && <p className="text-xs text-gray-400">{t('routing.settings.unavailable')}</p>}
      {state.error && (
        <div className="flex items-center gap-3">
          <ErrorLine>{t('routing.settings.loadError')}</ErrorLine>
          <Button size="sm" variant="secondary" onClick={state.reload}>
            {t('routing.settings.retry')}
          </Button>
        </div>
      )}
      {settings && (
        <>
          <ScopeBadge scope={settings.scope} />
          <RoutingEditor
            key={settings.scope}
            testId="routing-global"
            settings={settings}
            saveLabel={t('routing.settings.save')}
            doneText={t('routing.settings.saved')}
            onSave={state.save}
          />
        </>
      )}
    </div>
  )
}

function ProjectRouting() {
  const { t } = useT()
  const projects = useProjectOptions()
  const [slug, setSlug] = useState('')
  const state = useRoutingSettings(slug || null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { settings } = state

  const back = async () => {
    setError(null)
    setNote(null)
    try {
      await state.removeOverride()
      setNote(t('routing.settings.overrideRemoved'))
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403 ? t('routing.settings.errors.forbidden') : t('routing.settings.errors.generic'))
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-100">{t('routing.settings.projectTitle')}</h3>
      <p className="text-xs text-gray-400">{t('routing.settings.projectHint')}</p>
      <ProjectPicker
        id="routing-project"
        projects={projects}
        value={slug}
        onChange={(s) => {
          setSlug(s)
          setNote(null)
          setError(null)
        }}
        label={t('routing.settings.projectLabel')}
      />
      {slug && state.loading && <Loading>{t('routing.settings.loading')}</Loading>}
      {slug && state.error && (
        <div className="flex items-center gap-3">
          <ErrorLine>{t('routing.settings.loadError')}</ErrorLine>
          <Button size="sm" variant="secondary" onClick={state.reload}>
            {t('routing.settings.retry')}
          </Button>
        </div>
      )}
      {slug && settings && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ScopeBadge scope={settings.scope} />
            {settings.scope === 'project' && (
              <Button size="sm" variant="ghost" onClick={() => void back()}>
                {t('routing.settings.backToGlobal')}
              </Button>
            )}
          </div>
          {error && <ErrorLine>{error}</ErrorLine>}
          {note && (
            <p role="status" className="text-xs text-emerald-300">
              {note}
            </p>
          )}
          <RoutingEditor
            key={`${slug}-${settings.scope}`}
            testId="routing-project"
            settings={settings}
            saveLabel={t('routing.settings.override')}
            doneText={t('routing.settings.overrideSaved')}
            onSave={async (s) => {
              setNote(null)
              const saved = await state.save(s)
              // The editor remounts when the scope flips to `project`: say it here too.
              setNote(t('routing.settings.overrideSaved'))
              return saved
            }}
          />
        </>
      )}
    </div>
  )
}

/**
 * The "Routage" section of the provider settings: mode, learning stage and
 * tuning (global, with an optional override per project), then what PO
 * decided and the shadow report.
 */
export function RoutingSettings() {
  const { t } = useT()
  return (
    <div className="space-y-6" data-testid="routing-settings">
      <p className="text-xs text-gray-400">{t('routing.settings.description')}</p>
      <GlobalRouting />
      <ProjectRouting />
      <ShadowReportCard />
      <RoutingDecisionsTable />
    </div>
  )
}
