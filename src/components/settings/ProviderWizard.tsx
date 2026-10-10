/**
 * "Add a provider" — a guided wizard in five numbered steps:
 *
 *   1. Model       — a preset pre-fills id, label, base URL, model, cost and the kind of key;
 *   2. Key         — a new key (typed here, stored straight into the vault), a key already in
 *                    the vault, an `env:` variable of the server, or none;
 *   3. Connection  — the chain: store the key → create the instance → grant the key to it → test;
 *   4. Project     — consent of one project, bound to the origin shown (optional);
 *   5. Summary.
 *
 * Security rules (docs/guides/providers.md, docs/api/provider-errors.md):
 * - the body of `POST /chat/providers` (and `/test`) only ever carries a REFERENCE
 *   (`vault:<name>`, `env:<VAR>`, `none`) — never a key;
 * - the key itself only goes to `PUT /vault/secrets/{name}` (with the unlock proof
 *   of this tab). It is read once from an uncontrolled password input, which is
 *   emptied before the call; it is never in React state, an atom, the URL,
 *   storage, a log or a message;
 * - nothing is written to the vault without a valid unlock proof;
 * - an existing vault name is never overwritten.
 *
 * Order of the chain: the backend accepts a `Provider(instance)` grant only for an
 * instance that already exists and whose `credential_ref` names that key
 * (`validate_provider_grant`), and tests a draft that uses a key only once it is
 * saved (`credential_test_requires_saved_instance`). Hence secret → instance →
 * grant → test.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { Button, Facts, surface } from '@/components/ui'
import { presetByKey, presetLabel } from '@/constants/providerPresets'
import {
  COST_LABEL_KEYS,
  GRANT_CHOICES,
  TASK_LABEL_KEYS,
  toolsNotCalledText,
  WIZARD_STEPS,
  type T,
  type TaskKey,
  type TaskState,
  isProcessKind,
  kindLabel,
  providerErrorFr,
  suggestedSecretName,
  validateBaseUrlFr,
  validateEnvName,
  validateInstanceId,
  validateSecretName,
  verdictCodeFr,
  wizardErrorMessage,
} from '@/constants/providerWizard'
import { originOf } from '@/constants/providerSettings'
import {
  REMOTE_KIND,
  remoteInstanceId,
  remoteOrigin,
  validateMachineName,
  validateVaultKeyName,
} from '@/constants/remoteClaudeCode'
import { useProviders } from '@/hooks/useProviders'
import { useT } from '@/i18n'
import { normalizeProviderHealth, providersApi } from '@/services/providers'
import { hasUnlockProof, vaultApi, type VaultOverview } from '@/services/vault'
import type { CredentialRef, ProviderPreset } from '@/types/provider'
import type { ProviderDraft, ProviderTestResult } from '@/types/providerSettings'
import { ConfirmPanel } from './ConfirmPanel'
import {
  EMPTY_REMOTE,
  RemoteHostFields,
  remoteErrors,
  type RemoteField,
  type RemoteState,
} from './RemoteHostFields'
import { useProjectOptions } from './useProjectOptions'
import {
  KeyStep,
  ModelPicker,
  PresetStep,
  ProjectStep,
  StepIntro,
  TaskList,
  Verdict,
  type IdentityField,
  type IdentityState,
  type KeyField,
  type KeyState,
  type VerdictView,
} from './ProviderWizardSteps'

interface ProviderWizardProps {
  /** Ids already taken, for the uniqueness check. */
  existingIds: readonly string[]
  /** Closes the wizard (cancel, or rollback done). */
  onClose: () => void
  /** "Terminer": the instance exists. */
  onFinished: (id: string) => void
}

/** What THIS wizard created, so that a cancel removes exactly that. */
interface Created {
  secret?: string
  instance?: string
  grantId?: string
}

/** A refusal of the wizard itself (not a server answer): its message is already localized. */
class WizardStop extends Error {}

const NO_TASKS: Record<TaskKey, TaskState> = {
  secret: 'todo',
  instance: 'todo',
  grant: 'todo',
  test: 'todo',
}

function initialIdentity(key: string, t: T): IdentityState {
  const p = presetByKey(key)
  return {
    presetKey: p.key,
    id: p.id,
    label: presetLabel(t, p),
    baseUrl: p.base_url,
    model: p.default_model,
    cost: p.cost_source,
  }
}

function initialKey(key: string): KeyState {
  const p = presetByKey(key)
  return {
    // A remote machine's SSH key is never typed: it is chosen among the vault's.
    mode: p.kind === REMOTE_KIND ? 'existing' : p.credential_kind === 'vault' ? 'new' : p.credential_kind,
    secretName: suggestedSecretName(p.id),
    secretNameEdited: false,
    existingName: '',
    envName: '',
    grantMinutes: 43200,
  }
}

function toVerdict(result: ProviderTestResult, id: string, t: T): VerdictView {
  const health = normalizeProviderHealth(result.health, id)
  const models = result.models ?? []
  const reachable =
    health.status === 'healthy' || health.status === 'degraded'
      ? t('providerWizard.verdict.yes')
      : health.status === 'auth_required'
        ? t('providerWizard.verdict.yesButAuth')
        : health.status === 'unhealthy'
          ? t('providerWizard.verdict.no')
          : models.length > 0
            ? t('providerWizard.verdict.yes')
            : t('providerWizard.verdict.unknown')
  const shown = models
    .slice(0, 6)
    .map((m) => m.id)
    .join(', ')
  const problem = health.error
    ? (verdictCodeFr(health.error.code, t) ?? providerErrorFr(health.error, t))
    : null
  return {
    ok: result.ok === true,
    reachable,
    models:
      models.length === 0
        ? t('providerWizard.verdict.modelsNone')
        : t(models.length === 1 ? 'providerWizard.verdict.modelsFoundOne' : 'providerWizard.verdict.modelsFoundMany', {
            n: models.length,
            list: `${shown}${models.length > 6 ? '…' : ''}`,
          }),
    tools: result.probe
      ? result.probe.tools
        ? t('providerWizard.verdict.yes')
        : t('providerWizard.verdict.toolsNo')
      : t('providerWizard.verdict.notTested'),
    context:
      result.probe?.context_window != null
        ? t('providerWizard.verdict.contextTokens', { n: result.probe.context_window })
        : t('providerWizard.verdict.contextUnknown'),
    problem:
      result.probe &&
      !result.probe.tools &&
      (!health.error || health.error.code === 'model_no_tools')
        ? toolsNotCalledText(t)
        : (problem ?? (result.ok ? null : t('providerWizard.verdict.notPassed'))),
    loginHint: health.login_hint ?? null,
  }
}

export function ProviderWizard({ existingIds, onClose, onFinished }: ProviderWizardProps) {
  const tr = useT()
  const { t } = tr
  const uid = useId().replace(/:/g, '')
  const { providers, refresh } = useProviders()
  const projects = useProjectOptions()

  const [step, setStep] = useState(0)
  const [identity, setIdentity] = useState<IdentityState>(() => initialIdentity('deepseek', t))
  const [idTouched, setIdTouched] = useState<Partial<Record<IdentityField, boolean>>>({})
  const [keyState, setKeyState] = useState<KeyState>(() => initialKey('deepseek'))
  const [keyTouched, setKeyTouched] = useState<Partial<Record<KeyField, boolean>>>({})
  /** Whether the password input holds something — never the value itself. */
  const [keyTyped, setKeyTyped] = useState(false)
  const [remote, setRemote] = useState<RemoteState>(EMPTY_REMOTE)
  const [remoteTouched, setRemoteTouched] = useState<Partial<Record<RemoteField, boolean>>>({})
  const keyInputRef = useRef<HTMLInputElement | null>(null)

  const [vault, setVault] = useState<VaultOverview | null>(null)
  const [vaultError, setVaultError] = useState<string | null>(null)

  const [tasks, setTasks] = useState<Record<TaskKey, TaskState>>(NO_TASKS)
  const [failure, setFailure] = useState<{ task: TaskKey; message: string } | null>(null)
  const [created, setCreated] = useState<Created>({})
  const [test, setTest] = useState<ProviderTestResult | null>(null)
  /** The model sent as `default_model` in the last test ('' = none: the server probes the first model it lists). */
  const [testedModel, setTestedModel] = useState<string | null>(null)
  /** Model chosen in "Model to test" (null = the suggestion of the list). */
  const [pickedModel, setPickedModel] = useState<string | null>(null)
  /** `default_model` of the instance as SAVED on the server ('' = none). */
  const [savedDefault, setSavedDefault] = useState<string | null>(null)
  const [defaultBusy, setDefaultBusy] = useState(false)
  const [defaultError, setDefaultError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  /** Synchronous guard: a double click must not start the chain (or a test) twice. */
  const runningRef = useRef(false)

  const [projectSlug, setProjectSlug] = useState('')
  const [consented, setConsented] = useState<{ slug: string; origin: string } | null>(null)
  const [consentBusy, setConsentBusy] = useState(false)
  const [consentError, setConsentError] = useState<string | null>(null)

  const [confirmCancel, setConfirmCancel] = useState(false)
  const [rollbackError, setRollbackError] = useState<string | null>(null)

  const preset = presetByKey(identity.presetKey)
  const process = isProcessKind(preset.kind)
  const isRemote = preset.kind === REMOTE_KIND
  /** `claude-code@<name>` for a remote machine: the name typed is only its suffix. */
  const instanceId = isRemote ? remoteInstanceId(identity.id) : identity.id.trim()

  const refreshVault = useCallback(async () => {
    try {
      setVault(await vaultApi.overview())
      setVaultError(null)
    } catch (err) {
      setVault(null)
      setVaultError(wizardErrorMessage(err, t))
    }
  }, [t])

  useEffect(() => {
    void refreshVault()
  }, [refreshVault])

  // ---- Derived values -----------------------------------------------------

  const usesVault = keyState.mode === 'new' || keyState.mode === 'existing'
  // The unlock proof lives in memory in services/vault (never storage): re-read at each render.
  const canWriteVault = !!vault?.initialized && !!vault.unlocked_until && hasUnlockProof()
  const secretName = keyState.secretName.trim()
  const vaultName = keyState.mode === 'new' ? secretName : keyState.existingName
  const credentialRef: CredentialRef =
    keyState.mode === 'none'
      ? 'none'
      : keyState.mode === 'env'
        ? `env:${keyState.envName.trim()}`
        : `vault:${vaultName}`

  const identityErrors = useMemo(() => {
    const e: Partial<Record<IdentityField, string>> = {}
    const id = isRemote
      ? validateMachineName(identity.id, existingIds, t)
      : validateInstanceId(identity.id, existingIds, t)
    if (id) e.id = id
    if (!process) {
      const url = validateBaseUrlFr(identity.baseUrl, t)
      if (url) e.url = url
    }
    return e
  }, [identity.id, identity.baseUrl, existingIds, process, isRemote, t])

  const remoteErrs = useMemo(() => (isRemote ? remoteErrors(remote, t) : {}), [isRemote, remote, t])

  const keyErrors = useMemo(() => {
    const e: Partial<Record<KeyField | 'vault', string>> = {}
    if (keyState.mode === 'new') {
      if (!keyTyped) e.secret = t('providerWizard.keyErrors.required')
      const name = validateSecretName(keyState.secretName, t)
      if (name) e.secretName = name
      else if (vault?.secrets.some((s) => s.name === secretName)) {
        e.secretName = t('providerWizard.keyErrors.nameTaken')
      }
    }
    if (keyState.mode === 'existing' && !keyState.existingName)
      e.existingName = isRemote ? t('providerWizard.keyErrors.chooseSsh') : t('providerWizard.keyErrors.chooseVault')
    else if (isRemote) {
      const bad = validateVaultKeyName(keyState.existingName, t)
      if (bad) e.existingName = bad
    }
    if (keyState.mode === 'env') {
      const env = validateEnvName(keyState.envName, t)
      if (env) e.envName = env
    }
    if (usesVault) {
      if (!vault)
        e.vault = vaultError ? t('providerWizard.keyErrors.vaultUnreachable') : t('providerWizard.keyErrors.vaultReading')
      else if (!vault.initialized) e.vault = t('providerWizard.keyErrors.createVault')
      else if (!canWriteVault) e.vault = t('providerWizard.keyErrors.unlockVault')
    }
    return e
  }, [keyState, keyTyped, vault, vaultError, secretName, usesVault, canWriteVault, isRemote, t])

  /** Sub-steps of the chain, for the key mode chosen. */
  const plan: TaskKey[] = useMemo(
    () => [
      ...(keyState.mode === 'new' ? (['secret'] as const) : []),
      'instance',
      ...(usesVault ? (['grant'] as const) : []),
      'test',
    ],
    [keyState.mode, usesVault]
  )
  const somethingCreated = !!(created.secret || created.instance || created.grantId)
  const chainReady =
    tasks.instance === 'done' && (!usesVault || tasks.grant === 'done') && tasks.test === 'done'

  const draft = (): ProviderDraft => ({
    id: instanceId,
    kind: preset.kind,
    preset: preset.preset as ProviderPreset | 'opencode' | null,
    label: identity.label.trim() || presetLabel(t, preset) || instanceId,
    base_url: process ? '' : identity.baseUrl.trim(),
    default_model: identity.model.trim() || null,
    cost_source: identity.cost,
    credential_ref: credentialRef,
    ...(isRemote
      ? {
          host: remote.host.trim(),
          ...(remote.sshUser.trim() ? { ssh_user: remote.sshUser.trim() } : {}),
          ...(remote.sshPort.trim() ? { ssh_port: Number(remote.sshPort) } : {}),
          host_key: remote.hostKey.trim(),
          ...(remote.remoteCwd.trim() ? { remote_cwd: remote.remoteCwd.trim() } : {}),
          allow_trust: remote.allowTrust,
        }
      : {}),
  })

  const savedInstance = providers.find((p) => p.id === created.instance)
  const origin =
    savedInstance?.origin ??
    (preset.kind === 'codex'
      ? 'process:codex'
      : preset.kind === 'acp'
        ? `process:acp:${preset.preset ?? ''}`
        : isRemote
          ? remoteOrigin(remote.host, remote.sshUser, remote.sshPort)
          : originOf(identity.baseUrl.trim()))

  // ---- Edits ---------------------------------------------------------------

  const choosePreset = (key: string) => {
    const next = initialIdentity(key, t)
    setIdentity((cur) => ({
      ...next,
      // Keep what the user typed over a suggestion of the previous preset.
      label: cur.label && cur.label !== presetLabel(t, presetByKey(cur.presetKey)) ? cur.label : next.label,
    }))
    setKeyState(initialKey(key))
    setIdTouched({})
  }

  const editIdentity = (patch: Partial<IdentityState>) => {
    setIdentity((cur) => ({ ...cur, ...patch }))
    if (patch.id !== undefined && !keyState.secretNameEdited) {
      setKeyState((k) => ({ ...k, secretName: suggestedSecretName(patch.id!) }))
    }
  }

  // ---- The chain -------------------------------------------------------------

  /**
   * Runs the sub-steps that are not done yet, in order, and stops at the first
   * failure. `secretValue` is only given on the first run, from the password
   * input (already emptied); it is dropped as soon as the vault has it.
   */
  const run = async (
    secretValue: string | null,
    from: Record<TaskKey, TaskState>,
    already: Created,
    /** Model to probe instead of the draft's default (only the test uses it). */
    testModel?: string
  ) => {
    if (runningRef.current) return
    runningRef.current = true
    setRunning(true)
    setFailure(null)
    const state = { ...from }
    const done: Created = { ...already }
    const d = draft()
    let value = secretValue
    for (const task of plan) {
      if (state[task] === 'done') continue
      state[task] = 'running'
      setTasks({ ...state })
      try {
        if (task === 'secret') {
          if (!value) throw new WizardStop(t('providerWizard.stop.noKey'))
          if (!hasUnlockProof()) throw new WizardStop(t('providerWizard.stop.locked'))
          await vaultApi.putSecret(secretName, value, t('providerWizard.stop.secretNote', { id: d.id }))
          value = null
          done.secret = secretName
        } else if (task === 'instance') {
          const stored = await providersApi.create(d)
          // The server names a remote instance after the LABEL, not after the id the
          // wizard computed: every later step (grant, consent, removal) uses its answer.
          done.instance = storedInstanceId(stored) ?? d.id
          setSavedDefault(d.default_model ?? '')
        } else if (task === 'grant') {
          const grant = await vaultApi.createGrant({
            secrets: { kind: 'names', names: [vaultName] },
            scope: { kind: 'provider', value: done.instance ?? d.id },
            minutes: keyState.grantMinutes,
            note: t('providerWizard.stop.grantNote', { id: done.instance ?? d.id }),
          })
          done.grantId = grant.id
        } else {
          const probed = testModel ?? d.default_model ?? ''
          const result = await providersApi.test({ ...d, default_model: probed || null })
          setTestedModel(probed)
          setPickedModel(null)
          setDefaultError(null)
          setTest(result)
        }
        state[task] = 'done'
        setTasks({ ...state })
        setCreated({ ...done })
      } catch (err) {
        value = null
        state[task] = 'error'
        setTasks({ ...state })
        setCreated({ ...done })
        setFailure({
          task,
          message: err instanceof WizardStop ? err.message : wizardErrorMessage(err, t),
        })
        runningRef.current = false
        setRunning(false)
        if (done.instance) void refresh()
        return
      }
    }
    runningRef.current = false
    setRunning(false)
    void refresh()
  }

  const startChain = () => {
    // Read the key ONCE, empty the field at once: the value only lives in this call.
    let secret: string | null = null
    if (keyState.mode === 'new' && keyInputRef.current) {
      secret = keyInputRef.current.value
      keyInputRef.current.value = ''
    }
    setKeyTyped(false)
    setStep(2)
    void run(secret, NO_TASKS, {})
  }

  const retestOnly = () => {
    void run(null, { ...tasks, test: 'todo' }, created, testedModel ?? undefined)
  }

  /** Probe another model of the list. The secret, the instance and the grant are not touched again. */
  const testModel = (model: string) => {
    void run(null, { ...tasks, test: 'todo' }, created, model)
  }

  /** Make the model that just passed the test the default of the saved instance (one field). */
  const makeDefault = async (model: string) => {
    if (!created.instance) return
    setDefaultBusy(true)
    setDefaultError(null)
    try {
      await providersApi.update(created.instance, { default_model: model })
      setSavedDefault(model)
      setIdentity((cur) => ({ ...cur, model }))
      void refresh()
    } catch (err) {
      setDefaultError(wizardErrorMessage(err, t))
    } finally {
      setDefaultBusy(false)
    }
  }

  /** Removes what this wizard created, newest first; says what could not be removed. */
  const rollback = async () => {
    setRollbackError(null)
    const left: string[] = []
    if (created.grantId) {
      try {
        await vaultApi.revokeGrant(created.grantId)
      } catch {
        left.push(t('providerWizard.stop.leftGrant'))
      }
    }
    if (created.instance) {
      try {
        await providersApi.remove(created.instance)
      } catch {
        left.push(t('providerWizard.stop.leftInstance', { id: created.instance }))
      }
    }
    if (created.secret) {
      try {
        await vaultApi.deleteSecret(created.secret)
      } catch {
        left.push(t('providerWizard.stop.leftSecret', { name: created.secret }))
      }
    }
    void refresh()
    if (left.length > 0) {
      setRollbackError(t('providerWizard.stop.rollbackFailed', { list: left.join(', ') }))
      setConfirmCancel(false)
      return
    }
    onClose()
  }

  const allow = async () => {
    if (!origin || !created.instance) return
    setConsentBusy(true)
    setConsentError(null)
    try {
      await providersApi.allow(projectSlug, created.instance, origin)
      setConsented({ slug: projectSlug, origin })
    } catch (err) {
      setConsentError(wizardErrorMessage(err, t))
    } finally {
      setConsentBusy(false)
    }
  }

  // ---- What blocks the next step ---------------------------------------------

  const blocker: string | null = (() => {
    if (step === 0) {
      return (
        identityErrors.id ??
        identityErrors.url ??
        remoteErrs.host ??
        remoteErrs.sshUser ??
        remoteErrs.sshPort ??
        remoteErrs.remoteCwd ??
        remoteErrs.hostKey ??
        null
      )
    }
    if (step === 1) {
      return (
        keyErrors.secret ??
        keyErrors.secretName ??
        keyErrors.existingName ??
        keyErrors.envName ??
        keyErrors.vault ??
        null
      )
    }
    if (step === 2) {
      if (running) return t('providerWizard.blocker.working')
      if (failure) return t('providerWizard.blocker.taskFailed', { task: t(TASK_LABEL_KEYS[failure.task]) })
      if (!chainReady) return t('providerWizard.blocker.mustTest')
      return null
    }
    return null
  })()

  const next = () => {
    if (blocker) return
    if (step === 1) return startChain()
    if (step === 4) return onFinished(created.instance ?? instanceId)
    setStep((s) => s + 1)
  }

  const back = () => {
    if (step === 1) setKeyTyped(false) // the input unmounts: whatever it held is gone
    setStep((s) => Math.max(0, s - 1))
  }
  // Once something exists, steps 1–2 are frozen (change it later with "Modifier").
  const canGoBack = step > 0 && !running && !(step === 2 && somethingCreated)

  const nextLabel =
    step === 1
      ? t('providerWizard.nav.saveAndTest')
      : step === 3
        ? consented
          ? t('providerWizard.nav.next')
          : t('providerWizard.nav.skip')
        : step === 4
          ? t('providerWizard.nav.finish')
          : t('providerWizard.nav.next')

  const cancel = () => {
    if (somethingCreated) setConfirmCancel(true)
    else onClose()
  }

  const verdict = test ? toVerdict(test, instanceId, t) : null
  const catalogue = (test?.models ?? []).map((m) => m.id)
  const proposed = identity.model.trim()
  const proposedMissing =
    !!test && catalogue.length > 0 && !!proposed && !catalogue.includes(proposed)
  /** Pre-selection: the model just tested when listed, else the first model listed. */
  const selectedModel =
    pickedModel ??
    (testedModel && catalogue.includes(testedModel) ? testedModel : (catalogue[0] ?? ''))
  const createdList = [
    created.secret && t('providerWizard.chain.createdItemSecret', { name: created.secret }),
    created.instance && t('providerWizard.chain.createdItemInstance', { id: created.instance }),
    created.grantId && t('providerWizard.chain.createdItemGrant'),
  ].filter(Boolean) as string[]

  return (
    <section
      aria-label={t('providerWizard.nav.title')}
      data-testid="provider-wizard"
      className={`${surface} space-y-6 p-4 md:p-6`}
    >
      <header className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-100">{t('providerWizard.nav.title')}</h3>
          <span className="text-xs text-gray-500">
            {t('providerWizard.nav.stepOf', { n: step + 1, total: WIZARD_STEPS.length })}
          </span>
        </div>
        <ol aria-label={t('providerWizard.nav.stepsAria')} className="grid grid-cols-5 gap-2">
          {WIZARD_STEPS.map((s, i) => {
            const state = i < step ? 'done' : i === step ? 'current' : 'todo'
            return (
              <li
                key={s.id}
                data-state={state}
                aria-current={state === 'current' ? 'step' : undefined}
                className="flex min-w-0 flex-col gap-1.5"
              >
                <span
                  className={`h-1 rounded-full ${state === 'todo' ? 'bg-white/[0.08]' : 'bg-indigo-500'}`}
                  aria-hidden="true"
                />
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                      state === 'done'
                        ? 'bg-indigo-600 text-white'
                        : state === 'current'
                          ? 'border border-indigo-400 text-indigo-300'
                          : 'border border-white/[0.12] text-gray-500'
                    }`}
                  >
                    {state === 'done' ? <Check className="h-3 w-3" aria-hidden="true" /> : i + 1}
                  </span>
                  <span
                    className={`truncate text-xs ${state === 'current' ? 'font-medium text-gray-100' : 'hidden text-gray-500 sm:inline'}`}
                  >
                    {t(s.title)}
                  </span>
                </span>
              </li>
            )
          })}
        </ol>
      </header>

      {step === 0 && (
        <PresetStep
          uid={uid}
          preset={preset}
          identity={identity}
          errors={identityErrors}
          touched={idTouched}
          onPreset={choosePreset}
          onChange={editIdentity}
          onTouch={(f) => setIdTouched((cur) => ({ ...cur, [f]: true }))}
          remoteSlot={
            isRemote ? (
              <RemoteHostFields
                uid={uid}
                value={remote}
                errors={remoteErrs}
                touched={remoteTouched}
                onChange={(patch) => setRemote((r) => ({ ...r, ...patch }))}
                onTouch={(f) => setRemoteTouched((cur) => ({ ...cur, [f]: true }))}
              />
            ) : undefined
          }
        />
      )}

      {step === 1 && (
        <KeyStep
          uid={uid}
          preset={preset}
          keyState={keyState}
          credentialRef={credentialRef}
          errors={keyErrors}
          touched={keyTouched}
          vault={vault}
          vaultError={vaultError}
          canWriteVault={canWriteVault}
          keyInputRef={keyInputRef}
          onChange={(patch) => setKeyState((k) => ({ ...k, ...patch }))}
          onTouch={(f) => setKeyTouched((cur) => ({ ...cur, [f]: true }))}
          onKeyTyped={setKeyTyped}
          onVaultChange={() => void refreshVault()}
        />
      )}

      {step === 2 && (
        <div className="space-y-6">
          <StepIntro
            title={t('providerWizard.chain.title')}
            what={t('providerWizard.chain.what')}
            why={t('providerWizard.chain.why')}
          />
          <TaskList tasks={tasks} plan={plan} />
          {failure && (
            <div
              role="alert"
              data-testid="wizard-failure"
              className="space-y-3 rounded-lg border border-red-500/30 bg-red-500/[0.06] p-3"
            >
              <p className="text-sm font-medium text-red-200">
                {t('providerWizard.chain.failure', { task: t(TASK_LABEL_KEYS[failure.task]), message: failure.message })}
              </p>
              <p data-testid="wizard-already-done" className="text-xs text-gray-300">
                {createdList.length > 0
                  ? t('providerWizard.chain.alreadyDone', { list: createdList.join(' ; ') })
                  : t('providerWizard.chain.nothingCreated')}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                {somethingCreated ? (
                  <Button size="sm" variant="danger" onClick={() => setConfirmCancel(true)}>
                    {t('providerWizard.chain.cancelAndDelete')}
                  </Button>
                ) : null}
                {failure.task === 'secret' && !somethingCreated ? (
                  <Button size="sm" variant="secondary" onClick={() => setStep(1)}>
                    {t('providerWizard.chain.backToKey')}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void run(null, tasks, created)}
                  >
                    {t('providerWizard.chain.resume')}
                  </Button>
                )}
              </div>
            </div>
          )}
          {verdict && <Verdict verdict={verdict} testedModel={testedModel ?? ''} />}
          {verdict && catalogue.length > 0 && (
            <ModelPicker
              uid={uid}
              models={catalogue}
              selected={selectedModel}
              testedModel={testedModel ?? ''}
              proposedMissing={proposedMissing ? proposed : null}
              lastOk={verdict.ok}
              savedDefault={savedDefault}
              running={running}
              defaultBusy={defaultBusy}
              defaultError={defaultError}
              onSelect={setPickedModel}
              onTest={() => testModel(selectedModel)}
              onUseAsDefault={() => void makeDefault(testedModel ?? '')}
            />
          )}
          {verdict && !running && catalogue.length === 0 && (
            <div className="flex justify-end">
              <Button size="sm" variant="secondary" onClick={retestOnly}>
                {t('providerWizard.chain.retest')}
              </Button>
            </div>
          )}
          {verdict && !verdict.ok && (
            <p className="text-xs text-gray-400">
              {t('providerWizard.chain.canContinue')}
            </p>
          )}
        </div>
      )}

      {step === 3 && (
        <ProjectStep
          projects={projects}
          projectSlug={projectSlug}
          origin={origin}
          consented={consented && consented.slug === projectSlug ? consented : null}
          consentError={consentError}
          onProject={(slug) => {
            setProjectSlug(slug)
            setConsentError(null)
          }}
          allowButton={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void allow()}
              loading={consentBusy}
            >
              {t('providerWizard.chain.allow', { origin: origin ?? '' })}
            </Button>
          }
        />
      )}

      {step === 4 && (
        <div className="space-y-6">
          <StepIntro
            title={t('providerWizard.summary.title')}
            what={t('providerWizard.summary.what')}
            why={t('providerWizard.summary.why')}
          />
          <div data-testid="wizard-summary" className={`${surface} px-3 py-1`}>
            <Facts
              columns={1}
              items={[
                { label: t('providerWizard.summary.provider'), value: `${draft().label} (${instanceId})` },
                { label: t('providerWizard.summary.type'), value: kindLabel(t, preset.kind) },
                { label: t('providerWizard.summary.origin'), value: origin ?? t('providerWizard.summary.unknown') },
                {
                  label: t('providerWizard.summary.pinned'),
                  value: <code className="break-all font-mono">{remote.hostKeyFingerprint || t('providerWizard.summary.computed')}</code>,
                  hidden: !isRemote,
                },
                {
                  label: t('providerAdmin.instances.trustLabel'),
                  value: remote.allowTrust ? t('providerAdmin.instances.trustAllowed') : t('providerAdmin.instances.trustDenied'),
                  hidden: !isRemote,
                },
                {
                  label: t('providerWizard.summary.model'),
                  value: (savedDefault ?? identity.model.trim()) || t('providerWizard.summary.noDefault'),
                },
                { label: t('providerWizard.summary.cost'), value: t(COST_LABEL_KEYS[identity.cost]) },
                { label: t('providerWizard.summary.key'), value: <code className="font-mono">{credentialRef}</code> },
                {
                  label: t('providerWizard.summary.grantLabel'),
                  value: usesVault
                    ? t('providerWizard.summary.grantFor', {
                        duration: (() => {
                          const choice = GRANT_CHOICES.find((c) => c.value === String(keyState.grantMinutes))
                          return choice ? t(choice.label) : t('providerWizard.grant.minutes', { n: keyState.grantMinutes })
                        })(),
                      })
                    : t('providerWizard.summary.notApplicable'),
                },
                {
                  label: t('providerWizard.summary.test'),
                  value: verdict
                    ? `${verdict.ok ? t('providerWizard.summary.testPassed') : t('providerWizard.summary.testFailed')}${testedModel ? t('providerWizard.summary.testWith', { model: testedModel }) : ''}`
                    : t('providerWizard.summary.testNotDone'),
                },
                {
                  label: t('providerWizard.summary.projectLabel'),
                  value: consented ? t('providerWizard.summary.projectAllowed', { slug: consented.slug }) : t('providerWizard.summary.projectNone'),
                },
              ]}
            />
          </div>
        </div>
      )}

      {rollbackError && (
        <p role="alert" className="text-xs text-red-400">
          {rollbackError}
        </p>
      )}
      {confirmCancel && (
        <ConfirmPanel
          title={t('providerWizard.cancelConfirm.title', { name: (isRemote ? instanceId : identity.id.trim()) || t('providerWizard.cancelConfirm.thisProvider') })}
          confirmLabel={t('providerWizard.cancelConfirm.confirm')}
          cancelLabel={t('providerWizard.cancelConfirm.keepGoing')}
          tone="danger"
          onConfirm={rollback}
          onCancel={() => setConfirmCancel(false)}
        >
          {t('providerWizard.cancelConfirm.body', { list: createdList.join(' ; ') })}
        </ConfirmPanel>
      )}

      <footer className="flex flex-col gap-3 border-t border-white/[0.06] pt-4">
        {blocker && (
          <p
            id={`${uid}-blocker`}
            data-testid="wizard-blocker"
            className="text-xs text-amber-300 sm:text-right"
          >
            {t('providerWizard.blocker.toContinue', { blocker })}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={cancel} disabled={running}>
            {t('providerWizard.nav.cancel')}
          </Button>
          {step > 0 && (
            <Button size="sm" variant="secondary" onClick={back} disabled={!canGoBack}>
              {t('providerWizard.nav.previous')}
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            onClick={next}
            disabled={!!blocker}
            aria-describedby={blocker ? `${uid}-blocker` : undefined}
          >
            {nextLabel}
          </Button>
        </div>
      </footer>
    </section>
  )
}

/** The id the server gave the instance it just stored (`undefined` when it did not say). */
function storedInstanceId(body: unknown): string | undefined {
  const id = (body as { id?: unknown } | null)?.id
  return typeof id === 'string' && id ? id : undefined
}
