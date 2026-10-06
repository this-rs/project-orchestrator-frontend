/**
 * "Ajouter un provider" — a guided wizard in five numbered steps:
 *
 *   1. Modèle      — a preset pre-fills id, label, base URL, model, cost and the kind of key;
 *   2. Clé         — a new key (typed here, stored straight into the vault), a key already in
 *                    the vault, an `env:` variable of the server, or none;
 *   3. Connexion   — the chain: store the key → create the instance → grant the key to it → test;
 *   4. Projet      — consent of one project, bound to the origin shown (optional);
 *   5. Récapitulatif.
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
import { presetByKey } from '@/constants/providerPresets'
import {
  COST_LABELS_FR,
  GRANT_CHOICES_FR,
  TASK_LABELS,
  TOOLS_NOT_CALLED_FR,
  WIZARD_STEPS,
  type TaskKey,
  type TaskState,
  isProcessKind,
  kindLabelFr,
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
import { useProviders } from '@/hooks/useProviders'
import { normalizeProviderHealth, providersApi } from '@/services/providers'
import { hasUnlockProof, vaultApi, type VaultOverview } from '@/services/vault'
import type { CredentialRef, ProviderPreset } from '@/types/provider'
import type { ProviderDraft, ProviderTestResult } from '@/types/providerSettings'
import { ConfirmPanel } from './ConfirmPanel'
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

/** A refusal of the wizard itself (not a server answer): its message is already French. */
class WizardStop extends Error {}

const NO_TASKS: Record<TaskKey, TaskState> = {
  secret: 'todo',
  instance: 'todo',
  grant: 'todo',
  test: 'todo',
}

function initialIdentity(key: string): IdentityState {
  const p = presetByKey(key)
  return {
    presetKey: p.key,
    id: p.id,
    label: p.label,
    baseUrl: p.base_url,
    model: p.default_model,
    cost: p.cost_source,
  }
}

function initialKey(key: string): KeyState {
  const p = presetByKey(key)
  return {
    mode: p.credential_kind === 'vault' ? 'new' : p.credential_kind,
    secretName: suggestedSecretName(p.id),
    secretNameEdited: false,
    existingName: '',
    envName: '',
    grantMinutes: 43200,
  }
}

function toVerdict(result: ProviderTestResult, id: string): VerdictView {
  const health = normalizeProviderHealth(result.health, id)
  const models = result.models ?? []
  const reachable =
    health.status === 'healthy' || health.status === 'degraded'
      ? 'Oui'
      : health.status === 'auth_required'
        ? 'Oui, mais il manque une connexion ou une clé'
        : health.status === 'unhealthy'
          ? 'Non'
          : models.length > 0
            ? 'Oui'
            : 'Inconnu'
  const shown = models
    .slice(0, 6)
    .map((m) => m.id)
    .join(', ')
  const problem = health.error
    ? (verdictCodeFr(health.error.code) ?? providerErrorFr(health.error))
    : null
  return {
    ok: result.ok === true,
    reachable,
    models:
      models.length === 0
        ? 'Aucun listé'
        : `${models.length} trouvé${models.length > 1 ? 's' : ''} : ${shown}${models.length > 6 ? '…' : ''}`,
    tools: result.probe ? (result.probe.tools ? 'Oui' : 'Non') : 'Non testé',
    context:
      result.probe?.context_window != null
        ? `${result.probe.context_window.toLocaleString('fr-FR')} tokens`
        : 'Inconnue',
    problem:
      result.probe &&
      !result.probe.tools &&
      (!health.error || health.error.code === 'model_no_tools')
        ? TOOLS_NOT_CALLED_FR
        : (problem ?? (result.ok ? null : 'Le provider n’a pas passé le test.')),
    loginHint: health.login_hint ?? null,
  }
}

export function ProviderWizard({ existingIds, onClose, onFinished }: ProviderWizardProps) {
  const uid = useId().replace(/:/g, '')
  const { providers, refresh } = useProviders()
  const projects = useProjectOptions()

  const [step, setStep] = useState(0)
  const [identity, setIdentity] = useState<IdentityState>(() => initialIdentity('deepseek'))
  const [idTouched, setIdTouched] = useState<Partial<Record<IdentityField, boolean>>>({})
  const [keyState, setKeyState] = useState<KeyState>(() => initialKey('deepseek'))
  const [keyTouched, setKeyTouched] = useState<Partial<Record<KeyField, boolean>>>({})
  /** Whether the password input holds something — never the value itself. */
  const [keyTyped, setKeyTyped] = useState(false)
  const keyInputRef = useRef<HTMLInputElement | null>(null)

  const [vault, setVault] = useState<VaultOverview | null>(null)
  const [vaultError, setVaultError] = useState<string | null>(null)

  const [tasks, setTasks] = useState<Record<TaskKey, TaskState>>(NO_TASKS)
  const [failure, setFailure] = useState<{ task: TaskKey; message: string } | null>(null)
  const [created, setCreated] = useState<Created>({})
  const [test, setTest] = useState<ProviderTestResult | null>(null)
  /** The model sent as `default_model` in the last test ('' = none: the server probes the first model it lists). */
  const [testedModel, setTestedModel] = useState<string | null>(null)
  /** Model chosen in "Modèle à tester" (null = the suggestion of the list). */
  const [pickedModel, setPickedModel] = useState<string | null>(null)
  /** `default_model` of the instance as SAVED on the server ('' = none). */
  const [savedDefault, setSavedDefault] = useState<string | null>(null)
  const [defaultBusy, setDefaultBusy] = useState(false)
  const [defaultError, setDefaultError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const [projectSlug, setProjectSlug] = useState('')
  const [consented, setConsented] = useState<{ slug: string; origin: string } | null>(null)
  const [consentBusy, setConsentBusy] = useState(false)
  const [consentError, setConsentError] = useState<string | null>(null)

  const [confirmCancel, setConfirmCancel] = useState(false)
  const [rollbackError, setRollbackError] = useState<string | null>(null)

  const preset = presetByKey(identity.presetKey)
  const process = isProcessKind(preset.kind)

  const refreshVault = useCallback(async () => {
    try {
      setVault(await vaultApi.overview())
      setVaultError(null)
    } catch (err) {
      setVault(null)
      setVaultError(wizardErrorMessage(err))
    }
  }, [])

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
    const id = validateInstanceId(identity.id, existingIds)
    if (id) e.id = id
    if (!process) {
      const url = validateBaseUrlFr(identity.baseUrl)
      if (url) e.url = url
    }
    return e
  }, [identity.id, identity.baseUrl, existingIds, process])

  const keyErrors = useMemo(() => {
    const e: Partial<Record<KeyField | 'vault', string>> = {}
    if (keyState.mode === 'new') {
      if (!keyTyped) e.secret = 'Saisissez la clé d’API.'
      const name = validateSecretName(keyState.secretName)
      if (name) e.secretName = name
      else if (vault?.secrets.some((s) => s.name === secretName)) {
        e.secretName =
          'Une clé porte déjà ce nom dans le coffre : choisissez « Clé déjà dans le coffre » ou un autre nom.'
      }
    }
    if (keyState.mode === 'existing' && !keyState.existingName)
      e.existingName = 'Choisissez une clé du coffre.'
    if (keyState.mode === 'env') {
      const env = validateEnvName(keyState.envName)
      if (env) e.envName = env
    }
    if (usesVault) {
      if (!vault)
        e.vault = vaultError ? 'Le coffre est inaccessible.' : 'Lecture du coffre en cours.'
      else if (!vault.initialized) e.vault = 'Créez d’abord le coffre.'
      else if (!canWriteVault) e.vault = 'Déverrouillez le coffre depuis cet onglet.'
    }
    return e
  }, [keyState, keyTyped, vault, vaultError, secretName, usesVault, canWriteVault])

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
    id: identity.id.trim(),
    kind: preset.kind,
    preset: preset.preset as ProviderPreset | 'opencode' | null,
    label: identity.label.trim() || preset.label || identity.id.trim(),
    base_url: process ? '' : identity.baseUrl.trim(),
    default_model: identity.model.trim() || null,
    cost_source: identity.cost,
    credential_ref: credentialRef,
  })

  const savedInstance = providers.find((p) => p.id === created.instance)
  const origin =
    savedInstance?.origin ??
    (preset.kind === 'codex'
      ? 'process:codex'
      : preset.kind === 'acp'
        ? `process:acp:${preset.preset ?? ''}`
        : originOf(identity.baseUrl.trim()))

  // ---- Edits ---------------------------------------------------------------

  const choosePreset = (key: string) => {
    const next = initialIdentity(key)
    setIdentity((cur) => ({
      ...next,
      // Keep what the user typed over a suggestion of the previous preset.
      label: cur.label && cur.label !== presetByKey(cur.presetKey).label ? cur.label : next.label,
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
    setRunning(true)
    setFailure(null)
    const state = { ...from }
    const done: Created = { ...already }
    const d = draft()
    let value = secretValue
    for (const t of plan) {
      if (state[t] === 'done') continue
      state[t] = 'running'
      setTasks({ ...state })
      try {
        if (t === 'secret') {
          if (!value) throw new WizardStop('La clé n’a pas été saisie : revenez à l’étape « Clé ».')
          if (!hasUnlockProof())
            throw new WizardStop('Le coffre est verrouillé : déverrouillez-le à l’étape « Clé ».')
          await vaultApi.putSecret(secretName, value, `Clé d’API du provider ${d.id}`)
          value = null
          done.secret = secretName
        } else if (t === 'instance') {
          await providersApi.create(d)
          done.instance = d.id
          setSavedDefault(d.default_model ?? '')
        } else if (t === 'grant') {
          const grant = await vaultApi.createGrant({
            secrets: { kind: 'names', names: [vaultName] },
            scope: { kind: 'provider', value: d.id },
            minutes: keyState.grantMinutes,
            note: `Provider ${d.id}`,
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
        state[t] = 'done'
        setTasks({ ...state })
        setCreated({ ...done })
      } catch (err) {
        value = null
        state[t] = 'error'
        setTasks({ ...state })
        setCreated({ ...done })
        setFailure({
          task: t,
          message: err instanceof WizardStop ? err.message : wizardErrorMessage(err),
        })
        setRunning(false)
        if (done.instance) void refresh()
        return
      }
    }
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
      setDefaultError(wizardErrorMessage(err))
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
        left.push('l’accord de la clé à l’instance')
      }
    }
    if (created.instance) {
      try {
        await providersApi.remove(created.instance)
      } catch {
        left.push(`l’instance « ${created.instance} »`)
      }
    }
    if (created.secret) {
      try {
        await vaultApi.deleteSecret(created.secret)
      } catch {
        left.push(`la clé « ${created.secret} » du coffre`)
      }
    }
    void refresh()
    if (left.length > 0) {
      setRollbackError(
        `Impossible de supprimer : ${left.join(', ')}. Supprimez-les à la main (liste des providers, coffre).`
      )
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
      setConsentError(wizardErrorMessage(err))
    } finally {
      setConsentBusy(false)
    }
  }

  // ---- What blocks the next step ---------------------------------------------

  const blocker: string | null = (() => {
    if (step === 0) return identityErrors.id ?? identityErrors.url ?? null
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
      if (running) return 'L’assistant travaille…'
      if (failure) return `« ${TASK_LABELS[failure.task]} » a échoué : reprenez ou annulez.`
      if (!chainReady) return 'L’instance doit être créée et testée.'
      return null
    }
    return null
  })()

  const next = () => {
    if (blocker) return
    if (step === 1) return startChain()
    if (step === 4) return onFinished(created.instance ?? identity.id.trim())
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
      ? 'Enregistrer et tester'
      : step === 3
        ? consented
          ? 'Suivant'
          : 'Passer cette étape'
        : step === 4
          ? 'Terminer'
          : 'Suivant'

  const cancel = () => {
    if (somethingCreated) setConfirmCancel(true)
    else onClose()
  }

  const verdict = test ? toVerdict(test, identity.id.trim()) : null
  const catalogue = (test?.models ?? []).map((m) => m.id)
  const proposed = identity.model.trim()
  const proposedMissing =
    !!test && catalogue.length > 0 && !!proposed && !catalogue.includes(proposed)
  /** Pre-selection: the model just tested when listed, else the first model listed. */
  const selectedModel =
    pickedModel ??
    (testedModel && catalogue.includes(testedModel) ? testedModel : (catalogue[0] ?? ''))
  const createdList = [
    created.secret && `la clé « ${created.secret} » est enregistrée dans le coffre`,
    created.instance && `l’instance « ${created.instance} » est créée`,
    created.grantId && 'la clé est accordée à l’instance',
  ].filter(Boolean) as string[]

  return (
    <section
      aria-label="Ajouter un provider"
      data-testid="provider-wizard"
      className={`${surface} space-y-6 p-4 md:p-6`}
    >
      <header className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-100">Ajouter un provider</h3>
          <span className="text-xs text-gray-500">
            Étape {step + 1} sur {WIZARD_STEPS.length}
          </span>
        </div>
        <ol aria-label="Étapes de l’assistant" className="grid grid-cols-5 gap-2">
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
                    {s.title}
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
          onTouch={(f) => setIdTouched((t) => ({ ...t, [f]: true }))}
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
          onTouch={(f) => setKeyTouched((t) => ({ ...t, [f]: true }))}
          onKeyTyped={setKeyTyped}
          onVaultChange={() => void refreshVault()}
        />
      )}

      {step === 2 && (
        <div className="space-y-6">
          <StepIntro
            title="3. Tester la connexion"
            what="L’assistant enregistre ce qu’il faut, dans cet ordre, puis teste la connexion. Chaque étape affiche son état."
            why="Le test d’appel d’outil porte sur UN modèle : celui envoyé comme modèle par défaut (ou, sans modèle, le premier listé par le serveur). Un échec ne vaut que pour ce modèle : vous pourrez en tester un autre de la liste. Un test qui utilise une clé n’est fait que sur une instance enregistrée."
          />
          <TaskList tasks={tasks} plan={plan} />
          {failure && (
            <div
              role="alert"
              data-testid="wizard-failure"
              className="space-y-3 rounded-lg border border-red-500/30 bg-red-500/[0.06] p-3"
            >
              <p className="text-sm font-medium text-red-200">
                Échec : {TASK_LABELS[failure.task]}. {failure.message}
              </p>
              <p data-testid="wizard-already-done" className="text-xs text-gray-300">
                {createdList.length > 0
                  ? `Déjà fait : ${createdList.join(' ; ')}. Rien d’autre n’a été créé.`
                  : 'Rien n’a été créé : ni clé, ni instance, ni accord.'}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                {somethingCreated ? (
                  <Button size="sm" variant="danger" onClick={() => setConfirmCancel(true)}>
                    Annuler et supprimer ce qui a été créé
                  </Button>
                ) : null}
                {failure.task === 'secret' && !somethingCreated ? (
                  <Button size="sm" variant="secondary" onClick={() => setStep(1)}>
                    Revenir à l’étape Clé
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void run(null, tasks, created)}
                  >
                    Reprendre
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
                Tester à nouveau
              </Button>
            </div>
          )}
          {verdict && !verdict.ok && (
            <p className="text-xs text-gray-400">
              Vous pouvez continuer : l’instance existe. Les conversations sur ce provider
              échoueront tant que le problème n’est pas réglé.
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
              Autoriser {origin}
            </Button>
          }
        />
      )}

      {step === 4 && (
        <div className="space-y-6">
          <StepIntro
            title="5. Récapitulatif"
            what="Voici ce qui existe maintenant."
            why="Les rôles, alias et la politique de modèle se règlent plus bas, dans « Avancé »."
          />
          <div data-testid="wizard-summary" className={`${surface} px-3 py-1`}>
            <Facts
              columns={1}
              items={[
                { label: 'Provider', value: `${draft().label} (${identity.id.trim()})` },
                { label: 'Type', value: kindLabelFr(preset.kind) },
                { label: 'Origine', value: origin ?? 'inconnue' },
                {
                  label: 'Modèle',
                  value: (savedDefault ?? identity.model.trim()) || 'aucun par défaut',
                },
                { label: 'Coût', value: COST_LABELS_FR[identity.cost] },
                { label: 'Clé', value: <code className="font-mono">{credentialRef}</code> },
                {
                  label: 'Accord',
                  value: usesVault
                    ? `clé accordée à l’instance pour ${GRANT_CHOICES_FR.find((c) => c.value === String(keyState.grantMinutes))?.label ?? `${keyState.grantMinutes} min`}`
                    : 'sans objet',
                },
                {
                  label: 'Test',
                  value: verdict
                    ? `${verdict.ok ? 'réussi' : 'en échec'}${testedModel ? ` avec ${testedModel}` : ''}`
                    : 'non fait',
                },
                {
                  label: 'Projet',
                  value: consented ? `${consented.slug} autorisé` : 'aucun autorisé pour l’instant',
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
          title={`Annuler l’ajout de ${identity.id.trim() || 'ce provider'} ?`}
          confirmLabel="Supprimer ce qui a été créé"
          cancelLabel="Continuer l’assistant"
          tone="danger"
          onConfirm={rollback}
          onCancel={() => setConfirmCancel(false)}
        >
          Déjà fait : {createdList.join(' ; ')}. Tout cela sera supprimé.
        </ConfirmPanel>
      )}

      <footer className="flex flex-col gap-3 border-t border-white/[0.06] pt-4">
        {blocker && (
          <p
            id={`${uid}-blocker`}
            data-testid="wizard-blocker"
            className="text-xs text-amber-300 sm:text-right"
          >
            Pour continuer : {blocker}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={cancel} disabled={running}>
            Annuler
          </Button>
          {step > 0 && (
            <Button size="sm" variant="secondary" onClick={back} disabled={!canGoBack}>
              Précédent
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
