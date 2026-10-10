/**
 * Bodies of the five steps of the "Add a provider" wizard. Presentational:
 * the state, the validation and the calls live in `ProviderWizard.tsx`.
 *
 * The one field that takes a secret (the API key, step 2) is UNCONTROLLED: its
 * value is never in React state, never in a `value` attribute of the DOM, and
 * the wizard reads it once, through the ref, when it sends it to the vault.
 */
import type { ReactNode, RefObject } from 'react'
import { Link } from 'react-router-dom'
import { Check, CircleDashed, Loader2, Lock, LockOpen, X } from 'lucide-react'
import { Button, Facts, Input, Select, ToneText, surface } from '@/components/ui'
import { CreateVault, LockPanel } from '@/pages/VaultPage'
import { PROVIDER_PRESETS, presetLabel, type ProviderPresetInfo } from '@/constants/providerPresets'
import {
  COST_LABEL_KEYS,
  GRANT_CHOICES,
  TASK_LABEL_KEYS,
  isProcessKind,
  kindLabel,
  type TaskKey,
  type TaskState,
} from '@/constants/providerWizard'
import { useT } from '@/i18n'
import { VAULT_PATH } from '@/constants/providerErrors'
import { REMOTE_ID_PREFIX, REMOTE_KIND } from '@/constants/remoteClaudeCode'
import { COST_BASES, type CostBasis } from '@/types/provider'
import type { VaultOverview } from '@/services/vault'
import type { Translator } from '@/i18n/translate'
import { ChoiceRow, FieldNote, FormField } from './FormField'
import { ModelField } from './ModelField'
import type { ProjectOption } from './useProjectOptions'

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/** "What / why / what blocks" header of a step. */
export function StepIntro({
  title,
  what,
  why,
}: {
  title: string
  what: ReactNode
  why: ReactNode
}) {
  return (
    <div className="space-y-1">
      <h4 className="text-base font-semibold text-gray-100">{title}</h4>
      <p className="text-sm text-gray-300">{what}</p>
      <p className="text-xs text-gray-500">{why}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 1 — preset and identity
// ---------------------------------------------------------------------------

export interface IdentityState {
  presetKey: string
  id: string
  label: string
  baseUrl: string
  model: string
  cost: CostBasis
}

export type IdentityField = 'id' | 'url'

export function PresetStep({
  uid,
  preset,
  identity,
  errors,
  touched,
  onPreset,
  onChange,
  onTouch,
  remoteSlot,
}: {
  uid: string
  preset: ProviderPresetInfo
  identity: IdentityState
  errors: Partial<Record<IdentityField, string>>
  touched: Partial<Record<IdentityField, boolean>>
  onPreset: (key: string) => void
  onChange: (patch: Partial<IdentityState>) => void
  onTouch: (field: IdentityField) => void
  /** The machine fields of a `claude_code_remote` preset. */
  remoteSlot?: ReactNode
}) {
  const { t } = useT()
  const COST_OPTIONS = COST_BASES.map((c) => ({ value: c, label: t(COST_LABEL_KEYS[c]) }))
  const process = isProcessKind(preset.kind)
  const remote = preset.kind === REMOTE_KIND
  const shown = (f: IdentityField) => (touched[f] ? errors[f] : undefined)
  return (
    <div className="space-y-6">
      <StepIntro
        title={t('providerWizard.step1.title')}
        what={t('providerWizard.step1.what')}
        why={t('providerWizard.step1.why')}
      />
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-gray-300">{t('providerWizard.step1.presetLegend')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {PROVIDER_PRESETS.map((p) => (
            <ChoiceRow
              key={p.key}
              name={`${uid}-preset`}
              value={p.key}
              checked={identity.presetKey === p.key}
              onChange={onPreset}
              title={
                <>
                  {presetLabel(t, p)}{' '}
                  <span className="font-normal text-gray-500">· {kindLabel(t, p.kind)}</span>
                </>
              }
              description={t(p.description)}
            />
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id={`${uid}-id`}
          label={remote ? t('providerWizard.step1.machineName') : t('providerWizard.step1.identifier')}
          help={
            remote
              ? t('providerWizard.step1.idHelpRemote', { id: `${REMOTE_ID_PREFIX}${identity.id.trim() || t('providerWizard.step1.namePlaceholderToken')}` })
              : t('providerWizard.step1.idHelp')
          }
          error={shown('id')}
        >
          <Input
            id={`${uid}-id`}
            value={identity.id}
            onChange={(e) => onChange({ id: e.target.value })}
            onBlur={() => onTouch('id')}
            aria-invalid={!!shown('id')}
            aria-describedby={shown('id') ? `${uid}-id-error` : `${uid}-id-help`}
            autoComplete="off"
            spellCheck={false}
          />
        </FormField>
        <FormField
          id={`${uid}-label`}
          label={t('providerAdmin.form.displayName')}
          help={t('providerAdmin.form.displayNameHelp')}
        >
          <Input
            id={`${uid}-label`}
            value={identity.label}
            onChange={(e) => onChange({ label: e.target.value })}
            aria-describedby={`${uid}-label-help`}
            placeholder={presetLabel(t, preset)}
          />
        </FormField>
        {remote ? (
          remoteSlot
        ) : process ? (
          <div className="sm:col-span-2">
            <p className={`${surface} px-3 py-2 text-xs text-gray-400`}>
              {preset.kind === 'codex'
                ? t('providerWizard.step1.codexNoUrl')
                : t('providerWizard.step1.acpNoUrl')}
            </p>
          </div>
        ) : (
          <FormField
            id={`${uid}-url`}
            className="sm:col-span-2"
            label={t('providerAdmin.form.baseUrl')}
            help={t('providerWizard.step1.urlHelp')}
            error={shown('url')}
          >
            <Input
              id={`${uid}-url`}
              value={identity.baseUrl}
              onChange={(e) => onChange({ baseUrl: e.target.value })}
              onBlur={() => onTouch('url')}
              placeholder="https://api.example.com/v1"
              aria-invalid={!!shown('url')}
              aria-describedby={shown('url') ? `${uid}-url-error` : `${uid}-url-help`}
              autoComplete="off"
              spellCheck={false}
            />
          </FormField>
        )}
        <FormField
          id={`${uid}-model`}
          label={t('providerAdmin.form.defaultModel')}
          help={t('providerWizard.step1.modelHelp')}
        >
          <Input
            id={`${uid}-model`}
            value={identity.model}
            onChange={(e) => onChange({ model: e.target.value })}
            aria-describedby={`${uid}-model-help`}
            placeholder={preset.model_hint ?? ''}
            autoComplete="off"
            spellCheck={false}
          />
        </FormField>
        <div className="min-w-0">
          <Select
            label={t('providerAdmin.form.costSource')}
            options={COST_OPTIONS}
            value={identity.cost}
            onChange={(v) => onChange({ cost: v as CostBasis })}
          />
          <FieldNote id={`${uid}-cost`} help={t('providerAdmin.form.costHelp')} />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2 — the key
// ---------------------------------------------------------------------------

export type KeyMode = 'new' | 'existing' | 'env' | 'none'

export interface KeyState {
  mode: KeyMode
  /** Vault name of a NEW key; follows the instance id until edited. */
  secretName: string
  secretNameEdited: boolean
  existingName: string
  envName: string
  grantMinutes: number
}

export type KeyField = 'secret' | 'secretName' | 'existingName' | 'envName'

function formatTime(date: Translator['date'], iso: string): string {
  return date(iso, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** State of the vault, and the in-place create / unlock flow of the vault page. */
function VaultState({
  vault,
  vaultError,
  canWrite,
  onChange,
}: {
  vault: VaultOverview | null
  vaultError: string | null
  canWrite: boolean
  onChange: () => void
}) {
  const { t, date } = useT()
  if (vaultError) {
    return (
      <p role="alert" className="text-xs text-red-400">
        {t('providerWizard.vaultState.unreachable', { error: vaultError })}
      </p>
    )
  }
  if (!vault) return <p className="text-xs text-gray-500">{t('providerWizard.vaultState.reading')}</p>
  if (vault.unavailable) {
    return (
      <p role="alert" className="text-xs text-red-400">
        {t('providerWizard.vaultState.fileUnreadable')}
      </p>
    )
  }
  if (!vault.initialized) {
    return (
      <div className="space-y-2" data-testid="wizard-vault-create">
        <p className="text-xs text-amber-300">
          {t('providerWizard.vaultState.notYet')}
        </p>
        <CreateVault onDone={onChange} />
      </div>
    )
  }
  if (!canWrite) {
    return (
      <div className="space-y-2" data-testid="wizard-vault-locked">
        <p className="flex items-center gap-2 text-xs text-amber-300">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          {t('providerWizard.vaultState.locked')}
        </p>
        <LockPanel overview={vault} onChange={onChange} />
      </div>
    )
  }
  return (
    <p className="flex items-center gap-2 text-xs text-emerald-400" data-testid="wizard-vault-open">
      <LockOpen className="h-3.5 w-3.5" aria-hidden="true" />
      {vault.unlocked_until
        ? t('providerWizard.vaultState.unlockedUntil', { time: formatTime(date, vault.unlocked_until) })
        : `${t('providerWizard.vaultState.unlocked')}.`}
    </p>
  )
}

export function KeyStep({
  uid,
  preset,
  keyState,
  credentialRef,
  errors,
  touched,
  vault,
  vaultError,
  canWriteVault,
  keyInputRef,
  onChange,
  onTouch,
  onKeyTyped,
  onVaultChange,
}: {
  uid: string
  preset: ProviderPresetInfo
  keyState: KeyState
  credentialRef: string
  errors: Partial<Record<KeyField, string>>
  touched: Partial<Record<KeyField, boolean>>
  vault: VaultOverview | null
  vaultError: string | null
  canWriteVault: boolean
  keyInputRef: RefObject<HTMLInputElement | null>
  onChange: (patch: Partial<KeyState>) => void
  onTouch: (field: KeyField) => void
  onKeyTyped: (typed: boolean) => void
  onVaultChange: () => void
}) {
  const { t } = useT()
  const acp = preset.kind === 'acp'
  // A remote Claude Code: only a vault reference to the SSH key; no key is ever typed here.
  const remote = preset.kind === REMOTE_KIND
  const names = vault?.secrets.map((s) => s.name) ?? []
  const shown = (f: KeyField) => (touched[f] ? errors[f] : undefined)
  const usesVault = keyState.mode === 'new' || keyState.mode === 'existing'

  return (
    <div className="space-y-6">
      <StepIntro
        title={t('providerWizard.step2.title')}
        what={
          <>
            {t('providerWizard.step2.whatLead')} <strong>{t('providerWizard.step2.whatRef')}</strong> :{' '}
            <code className="font-mono text-gray-200">vault:&lt;name&gt;</code>
            {t('providerWizard.step2.whatVault')}{' '}
            <code className="font-mono text-gray-200">env:&lt;VAR&gt;</code>
            {t('providerWizard.step2.whatEnv')} <code className="font-mono text-gray-200">none</code>.
          </>
        }
        why={t('providerWizard.step2.why')}
      />

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-gray-300">{t('providerWizard.step2.whereLegend')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <ChoiceRow
            name={`${uid}-keymode`}
            value="new"
            checked={keyState.mode === 'new'}
            disabled={acp || remote}
            onChange={(v) => onChange({ mode: v as KeyMode })}
            title={t('providerWizard.step2.newTitle')}
            description={t('providerWizard.step2.newDesc')}
          />
          <ChoiceRow
            name={`${uid}-keymode`}
            value="existing"
            checked={keyState.mode === 'existing'}
            disabled={acp || (vault !== null && names.length === 0)}
            onChange={(v) => onChange({ mode: v as KeyMode })}
            title={t('providerWizard.step2.existingTitle')}
            description={
              vault !== null && names.length === 0
                ? t('providerWizard.step2.existingNone')
                : t('providerWizard.step2.existingChoose')
            }
          />
          <ChoiceRow
            name={`${uid}-keymode`}
            value="env"
            checked={keyState.mode === 'env'}
            disabled={acp || remote}
            onChange={(v) => onChange({ mode: v as KeyMode })}
            title={t('providerAdmin.form.credEnv')}
            description={t('providerWizard.step2.envDesc')}
          />
          <ChoiceRow
            name={`${uid}-keymode`}
            value="none"
            checked={keyState.mode === 'none'}
            disabled={remote}
            onChange={(v) => onChange({ mode: v as KeyMode })}
            title={t('providerWizard.step2.noneTitle')}
            description={
              remote
                ? t('providerWizard.step2.noneRemote')
                : acp
                ? t('providerWizard.step2.noneAcp')
                : t('providerWizard.step2.noneLocal')
            }
          />
        </div>
      </fieldset>

      {remote && (
        <p data-testid="wizard-remote-key-note" className="text-xs text-gray-400">
          {t('providerWizard.step2.remoteNoteLead')} <strong>{t('providerWizard.step2.remoteNoteName')}</strong>{' '}
          {t('providerWizard.step2.remoteNoteTail')}{' '}
          {vault !== null && names.length === 0 && <>{t('providerWizard.step2.remoteNoKeys')} </>}
          <Link to={VAULT_PATH} className="text-indigo-400 underline hover:text-indigo-300">
            {t('providerWizard.step2.openVault')}
          </Link>
          <span data-testid="remote-key-hint" className="mt-1 block text-amber-300">
            {t('providerAdmin.remote.keyHint')}
          </span>
        </p>
      )}

      {keyState.mode === 'new' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id={`${uid}-secret`}
            label={t('providerWizard.step2.apiKey')}
            help={t('providerWizard.step2.apiKeyHelp')}
            error={shown('secret')}
          >
            <Input
              id={`${uid}-secret`}
              ref={keyInputRef}
              type="password"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => onKeyTyped(e.target.value.length > 0)}
              onBlur={() => onTouch('secret')}
              aria-invalid={!!shown('secret')}
              aria-describedby={shown('secret') ? `${uid}-secret-error` : `${uid}-secret-help`}
            />
          </FormField>
          <FormField
            id={`${uid}-secret-name`}
            label={t('providerWizard.step2.secretName')}
            help={t('providerWizard.step2.secretNameHelp')}
            error={shown('secretName')}
          >
            <Input
              id={`${uid}-secret-name`}
              value={keyState.secretName}
              onChange={(e) => onChange({ secretName: e.target.value, secretNameEdited: true })}
              onBlur={() => onTouch('secretName')}
              aria-invalid={!!shown('secretName')}
              aria-describedby={
                shown('secretName') ? `${uid}-secret-name-error` : `${uid}-secret-name-help`
              }
              autoComplete="off"
              spellCheck={false}
            />
          </FormField>
        </div>
      )}

      {keyState.mode === 'existing' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <Select
              label={t('providerAdmin.form.vaultKey')}
              placeholder={t('providerAdmin.form.chooseKey')}
              options={names.map((n) => ({ value: n, label: n }))}
              value={keyState.existingName}
              onChange={(v) => {
                onChange({ existingName: v })
                onTouch('existingName')
              }}
              error={shown('existingName') ?? undefined}
            />
            <FieldNote
              id={`${uid}-existing`}
              help={t('providerAdmin.form.namesOnly')}
            />
          </div>
        </div>
      )}

      {keyState.mode === 'env' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id={`${uid}-env`}
            label={t('providerAdmin.form.envName')}
            help={t('providerWizard.step2.envNameHelp')}
            error={shown('envName')}
          >
            <Input
              id={`${uid}-env`}
              value={keyState.envName}
              onChange={(e) => onChange({ envName: e.target.value })}
              onBlur={() => onTouch('envName')}
              aria-invalid={!!shown('envName')}
              aria-describedby={shown('envName') ? `${uid}-env-error` : `${uid}-env-help`}
              autoComplete="off"
              spellCheck={false}
            />
          </FormField>
        </div>
      )}

      {usesVault && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <Select
              label={t('providerWizard.step2.grantDuration')}
              options={GRANT_CHOICES.map((c) => ({ value: c.value, label: t(c.label) }))}
              value={String(keyState.grantMinutes)}
              onChange={(v) => onChange({ grantMinutes: Number(v) })}
            />
            <FieldNote
              id={`${uid}-grant`}
              help={t('providerWizard.step2.grantHelp')}
            />
          </div>
        </div>
      )}

      {usesVault && (
        <VaultState
          vault={vault}
          vaultError={vaultError}
          canWrite={canWriteVault}
          onChange={onVaultChange}
        />
      )}

      <p className="text-xs text-gray-400">
        {t('providerWizard.step2.refSaved')}{' '}
        <code data-testid="wizard-credential-ref" className="font-mono text-gray-200">
          {credentialRef}
        </code>
        {usesVault && (
          <>
            {' · '}
            <Link to={VAULT_PATH} className="text-indigo-400 underline hover:text-indigo-300">
              {t('providerWizard.step2.openVault')}
            </Link>
          </>
        )}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 3 — connection: the chain of sub-steps and the test verdict
// ---------------------------------------------------------------------------

function TaskIcon({ state }: { state: TaskState }) {
  if (state === 'done') return <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
  if (state === 'running')
    return <Loader2 className="h-4 w-4 animate-spin text-indigo-300" aria-hidden="true" />
  if (state === 'error') return <X className="h-4 w-4 text-red-400" aria-hidden="true" />
  return <CircleDashed className="h-4 w-4 text-gray-600" aria-hidden="true" />
}

export function TaskList({
  tasks,
  plan,
}: {
  tasks: Record<TaskKey, TaskState>
  plan: readonly TaskKey[]
}) {
  const { t } = useT()
  return (
    <ol className={`${surface} divide-y divide-white/[0.05]`} aria-label={t('providerWizard.chain.tasksAria')}>
      {plan.map((task) => (
        <li
          key={task}
          data-testid={`wizard-task-${task}`}
          data-state={tasks[task]}
          className="flex items-center gap-3 px-3 py-2.5"
        >
          <TaskIcon state={tasks[task]} />
          <span className="min-w-0 flex-1 text-sm text-gray-200">{t(TASK_LABEL_KEYS[task])}</span>
          <span
            className={`text-xs ${tasks[task] === 'error' ? 'text-red-400' : tasks[task] === 'done' ? 'text-emerald-400' : 'text-gray-500'}`}
          >
            {t(`providerWizard.taskState.${tasks[task]}`)}
          </span>
        </li>
      ))}
    </ol>
  )
}

export interface VerdictView {
  ok: boolean
  reachable: string
  models: string
  tools: string
  context: string
  problem: string | null
  loginHint: string | null
}

export function Verdict({ verdict, testedModel }: { verdict: VerdictView; testedModel: string }) {
  const { t } = useT()
  return (
    <div role="status" data-testid="wizard-test-result" className={`${surface} space-y-3 p-3`}>
      <div className="flex items-center gap-2">
        <ToneText tone={verdict.ok ? 'success' : 'danger'} icon label={verdict.ok ? t('providerWizard.verdictView.ok') : t('providerWizard.verdictView.failed')} className="text-xs" />
        <span className="text-sm text-gray-200">
          {verdict.ok ? t('providerWizard.verdictView.works') : t('providerWizard.verdictView.notYet')}
        </span>
      </div>
      <Facts
        columns={2}
        items={[
          {
            label: t('providerWizard.verdictView.modelTested'),
            value: testedModel ? (
              <span className="font-mono">{testedModel}</span>
            ) : (
              t('providerWizard.verdictView.noneGiven')
            ),
          },
          { label: t('providerWizard.verdictView.reachable'), value: verdict.reachable },
          { label: t('providerWizard.verdictView.models'), value: verdict.models },
          { label: t('providerWizard.verdictView.toolCall'), value: verdict.tools },
          { label: t('providerWizard.verdictView.window'), value: verdict.context },
        ]}
      />
      {verdict.problem && (
        <p data-testid="wizard-test-problem" className="text-sm text-amber-200">
          {verdict.problem}
        </p>
      )}
      {verdict.loginHint && (
        <p className="text-xs text-gray-400">
          {t('providerWizard.verdictView.loginCommand')}{' '}
          <code className="font-mono text-gray-200">{verdict.loginHint}</code>
        </p>
      )}
    </div>
  )
}

/**
 * "Modèle à tester": the models the endpoint listed, the one tested named, a
 * button to probe the chosen one, and — once a model passed — the offer to make
 * it the default of the saved instance.
 */
export function ModelPicker({
  uid,
  models,
  selected,
  testedModel,
  proposedMissing,
  lastOk,
  savedDefault,
  running,
  defaultBusy,
  defaultError,
  onSelect,
  onTest,
  onUseAsDefault,
}: {
  uid: string
  models: string[]
  selected: string
  testedModel: string
  /** The suggested default model, when the endpoint does not list it. */
  proposedMissing: string | null
  lastOk: boolean
  savedDefault: string | null
  running: boolean
  defaultBusy: boolean
  defaultError: string | null
  onSelect: (model: string) => void
  onTest: () => void
  onUseAsDefault: () => void
}) {
  const { t } = useT()
  // Offered for the model that just PASSED, when the saved default is another one.
  const offerDefault =
    lastOk && !!testedModel && savedDefault !== null && savedDefault !== testedModel
  return (
    <div data-testid="wizard-model-picker" className={`${surface} space-y-3 p-3`}>
      {proposedMissing && (
        <p data-testid="wizard-model-missing" className="text-sm text-amber-200">
          {t('providerWizard.picker.missing', { model: proposedMissing })}
        </p>
      )}
      {models.length > 8 ? (
        <ModelField
          id={`${uid}-model-to-test`}
          label={t('providerWizard.picker.toTest')}
          value={selected}
          onChange={onSelect}
          models={models.map((id) => ({ id }))}
          disabled={running}
          help={
            testedModel
              ? t('providerWizard.picker.testedHelp', { model: testedModel, result: lastOk ? t('providerWizard.picker.resultOk') : t('providerWizard.picker.resultFail') })
              : undefined
          }
        />
      ) : (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-gray-300">{t('providerWizard.picker.toTest')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {models.map((m) => (
              <ChoiceRow
                key={m}
                name={`${uid}-model-to-test`}
                value={m}
                checked={selected === m}
                disabled={running}
                onChange={onSelect}
                title={<span className="font-mono">{m}</span>}
                description={
                  m === testedModel
                    ? lastOk
                      ? t('providerWizard.picker.testedOk')
                      : t('providerWizard.picker.testedFail')
                    : t('providerWizard.picker.notTested')
                }
              />
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {t('providerWizard.picker.toolDepends')}
          </p>
        </fieldset>
      )}
      <p data-testid="wizard-saved-default" className="text-xs text-gray-400">
        {t('providerWizard.picker.savedDefault')}{' '}
        {savedDefault ? (
          <code className="font-mono text-gray-200">{savedDefault}</code>
        ) : (
          t('providerWizard.picker.noSaved')
        )}
        .
      </p>
      {offerDefault && (
        <p data-testid="wizard-default-offer" className="text-sm text-emerald-300">
          {t('providerWizard.picker.offer', { tested: testedModel, saved: savedDefault ? savedDefault : t('providerWizard.picker.noModel') })}
        </p>
      )}
      {defaultError && (
        <p role="alert" className="text-xs text-red-400">
          {defaultError}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {offerDefault && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onUseAsDefault}
            loading={defaultBusy}
            disabled={running}
          >
            {t('providerWizard.picker.useAsDefault')}
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          onClick={onTest}
          loading={running}
          disabled={!selected}
        >
          {t('providerWizard.picker.testThis')}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 4 — project consent
// ---------------------------------------------------------------------------

export function ProjectStep({
  projects,
  projectSlug,
  origin,
  consented,
  consentError,
  onProject,
  allowButton,
}: {
  projects: ProjectOption[] | null
  projectSlug: string
  origin: string | null
  consented: { slug: string; origin: string } | null
  consentError: string | null
  onProject: (slug: string) => void
  allowButton: ReactNode
}) {
  const { t } = useT()
  const project = projects?.find((p) => p.slug === projectSlug)
  return (
    <div className="space-y-6">
      <StepIntro
        title={t('providerWizard.projectStep.title')}
        what={t('providerWizard.projectStep.what')}
        why={t('providerWizard.projectStep.why')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <Select
            label={t('providerWizard.projectStep.project')}
            placeholder={
              projects === null
                ? t('providerWizard.projectStep.loading')
                : projects.length === 0
                  ? t('providerWizard.projectStep.noProject')
                  : t('providerWizard.projectStep.choose')
            }
            options={(projects ?? []).map((p) => ({ value: p.slug, label: p.name }))}
            value={projectSlug}
            onChange={onProject}
            disabled={!projects || projects.length === 0}
          />
          <FieldNote
            id="wizard-project"
            help={t('providerWizard.projectStep.noProjectHelp')}
          />
        </div>
        <div className="min-w-0">
          <span className="mb-1 block text-sm font-medium text-gray-300">{t('providerWizard.projectStep.origin')}</span>
          <p
            data-testid="wizard-origin"
            className={`${surface} break-all px-3 py-2 font-mono text-sm text-gray-200`}
          >
            {origin ?? t('providerWizard.projectStep.unknown')}
          </p>
          <FieldNote id="wizard-origin-note" help={t('providerWizard.projectStep.exactPlace')} />
        </div>
      </div>
      {projectSlug && origin && !consented && (
        <div className={`${surface} flex flex-wrap items-center justify-between gap-3 p-3`}>
          <p className="min-w-0 flex-1 text-sm text-gray-300">
            {t('providerWizard.projectStep.sentLead')} <strong>{project?.name ?? projectSlug}</strong>{' '}
            {t('providerWizard.projectStep.sentMid')}{' '}
            <code className="font-mono">{origin}</code>.
          </p>
          {allowButton}
        </div>
      )}
      {consented && (
        <p role="status" data-testid="wizard-consented" className="text-sm text-emerald-400">
          {t('providerWizard.projectStep.consented', { name: projects?.find((p) => p.slug === consented.slug)?.name ?? consented.slug, origin: consented.origin })}
        </p>
      )}
      {consentError && (
        <p role="alert" className="text-xs text-red-400">
          {consentError}
        </p>
      )}
    </div>
  )
}
