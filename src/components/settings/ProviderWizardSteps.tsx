/**
 * Bodies of the five steps of the "Ajouter un provider" wizard. Presentational:
 * the state, the validation and the calls live in `ProviderWizard.tsx`.
 *
 * The one field that takes a secret (the API key, step 2) is UNCONTROLLED: its
 * value is never in React state, never in a `value` attribute of the DOM, and
 * the wizard reads it once, through the ref, when it sends it to the vault.
 */
import type { ReactNode, RefObject } from 'react'
import { Link } from 'react-router-dom'
import { Check, CircleDashed, Loader2, Lock, LockOpen, X } from 'lucide-react'
import { Badge, Button, Facts, Input, Select, surface } from '@/components/ui'
import { CreateVault, LockPanel } from '@/pages/VaultPage'
import { PROVIDER_PRESETS, type ProviderPresetInfo } from '@/constants/providerPresets'
import {
  COST_LABELS_FR,
  GRANT_CHOICES_FR,
  TASK_LABELS,
  isProcessKind,
  kindLabelFr,
  type TaskKey,
  type TaskState,
} from '@/constants/providerWizard'
import { VAULT_PATH } from '@/constants/providerErrors'
import { COST_BASES, type CostBasis } from '@/types/provider'
import type { VaultOverview } from '@/services/vault'
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

const COST_OPTIONS = COST_BASES.map((c) => ({ value: c, label: COST_LABELS_FR[c] }))

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
}: {
  uid: string
  preset: ProviderPresetInfo
  identity: IdentityState
  errors: Partial<Record<IdentityField, string>>
  touched: Partial<Record<IdentityField, boolean>>
  onPreset: (key: string) => void
  onChange: (patch: Partial<IdentityState>) => void
  onTouch: (field: IdentityField) => void
}) {
  const process = isProcessKind(preset.kind)
  const shown = (f: IdentityField) => (touched[f] ? errors[f] : undefined)
  return (
    <div className="space-y-6">
      <StepIntro
        title="1. Choisir un modèle"
        what="Choisissez le type de provider : les champs dessous sont préremplis avec des valeurs proposées, que vous pouvez modifier."
        why="L’identifiant nomme l’instance dans les sessions et les rôles ; l’URL de base est l’endroit où partira le contenu des projets que vous autoriserez."
      />
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-gray-300">Modèle prédéfini</legend>
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
                  {p.label}{' '}
                  <span className="font-normal text-gray-500">· {kindLabelFr(p.kind)}</span>
                </>
              }
              description={p.description}
            />
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id={`${uid}-id`}
          label="Identifiant"
          help="Lettres minuscules, chiffres et « - ». Ne pourra plus changer."
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
          label="Nom affiché"
          help="Ce que l’on voit dans le sélecteur de provider."
        >
          <Input
            id={`${uid}-label`}
            value={identity.label}
            onChange={(e) => onChange({ label: e.target.value })}
            aria-describedby={`${uid}-label-help`}
            placeholder={preset.label}
          />
        </FormField>
        {process ? (
          <div className="sm:col-span-2">
            <p className={`${surface} px-3 py-2 text-xs text-gray-400`}>
              {preset.kind === 'codex'
                ? 'Pas d’URL : le serveur lance le programme « codex » de son PATH. Rien n’est envoyé ailleurs que là où Codex envoie lui-même.'
                : 'Pas d’URL : le serveur lance l’agent déclaré sous ce nom dans CHAT_PROVIDER_ACP_COMMANDS. Une requête ne transporte jamais de ligne de commande.'}
            </p>
          </div>
        ) : (
          <FormField
            id={`${uid}-url`}
            className="sm:col-span-2"
            label="URL de base"
            help="https obligatoire, sauf pour localhost, 127.0.0.1 et ::1."
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
          label="Modèle par défaut"
          help="Facultatif, valeur proposée : le modèle utilisé quand rien d’autre n’est choisi. Le test vous montrera les modèles que le serveur propose vraiment."
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
            label="Source du coût"
            options={COST_OPTIONS}
            value={identity.cost}
            onChange={(v) => onChange({ cost: v as CostBasis })}
          />
          <FieldNote id={`${uid}-cost`} help="Comment le coût des sessions sera compté." />
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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
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
  if (vaultError) {
    return (
      <p role="alert" className="text-xs text-red-400">
        Le coffre est inaccessible : {vaultError}
      </p>
    )
  }
  if (!vault) return <p className="text-xs text-gray-500">Lecture de l’état du coffre…</p>
  if (vault.unavailable) {
    return (
      <p role="alert" className="text-xs text-red-400">
        Le fichier du coffre ne peut pas être lu : rien ne peut y être enregistré.
      </p>
    )
  }
  if (!vault.initialized) {
    return (
      <div className="space-y-2" data-testid="wizard-vault-create">
        <p className="text-xs text-amber-300">
          Le coffre n’existe pas encore : créez-le ici, puis revenez à la clé.
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
          Le coffre est verrouillé (ou ouvert sans preuve depuis cet onglet). Déverrouillez-le pour
          continuer : rien n’est enregistré sans la phrase secrète.
        </p>
        <LockPanel overview={vault} onChange={onChange} />
      </div>
    )
  }
  return (
    <p className="flex items-center gap-2 text-xs text-emerald-400" data-testid="wizard-vault-open">
      <LockOpen className="h-3.5 w-3.5" aria-hidden="true" />
      Coffre déverrouillé
      {vault.unlocked_until ? ` jusqu’à ${formatTime(vault.unlocked_until)}` : ''}.
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
  const acp = preset.kind === 'acp'
  const names = vault?.secrets.map((s) => s.name) ?? []
  const shown = (f: KeyField) => (touched[f] ? errors[f] : undefined)
  const usesVault = keyState.mode === 'new' || keyState.mode === 'existing'

  return (
    <div className="space-y-6">
      <StepIntro
        title="2. La clé"
        what={
          <>
            Dites où se trouve la clé d’API. L’instance n’enregistre qu’une{' '}
            <strong>référence</strong> :{' '}
            <code className="font-mono text-gray-200">vault:&lt;nom&gt;</code> (une clé du coffre),{' '}
            <code className="font-mono text-gray-200">env:&lt;VAR&gt;</code> (une variable du
            serveur) ou <code className="font-mono text-gray-200">none</code>.
          </>
        }
        why="La clé reste chiffrée dans le coffre : la configuration du provider ne la reçoit jamais, et le serveur ne la lit que pour ce provider, grâce à un accord limité dans le temps."
      />

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-gray-300">Où est la clé ?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <ChoiceRow
            name={`${uid}-keymode`}
            value="new"
            checked={keyState.mode === 'new'}
            disabled={acp}
            onChange={(v) => onChange({ mode: v as KeyMode })}
            title="Saisir une nouvelle clé"
            description="Tapée ici, elle part directement dans le coffre, chiffrée."
          />
          <ChoiceRow
            name={`${uid}-keymode`}
            value="existing"
            checked={keyState.mode === 'existing'}
            disabled={acp || (vault !== null && names.length === 0)}
            onChange={(v) => onChange({ mode: v as KeyMode })}
            title="Clé déjà dans le coffre"
            description={
              vault !== null && names.length === 0
                ? 'Le coffre ne contient encore aucune clé.'
                : 'Choisissez-la par son nom.'
            }
          />
          <ChoiceRow
            name={`${uid}-keymode`}
            value="env"
            checked={keyState.mode === 'env'}
            disabled={acp}
            onChange={(v) => onChange({ mode: v as KeyMode })}
            title="Variable d’environnement du serveur"
            description="Refusée si la variable n’est pas déclarée dans CHAT_PROVIDER_ENV_CREDENTIALS."
          />
          <ChoiceRow
            name={`${uid}-keymode`}
            value="none"
            checked={keyState.mode === 'none'}
            onChange={(v) => onChange({ mode: v as KeyMode })}
            title="Aucune clé"
            description={
              acp
                ? 'Un agent ACP gère sa propre connexion.'
                : 'Modèle local (Ollama…) ou programme qui gère sa connexion.'
            }
          />
        </div>
      </fieldset>

      {keyState.mode === 'new' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id={`${uid}-secret`}
            label="Clé d’API"
            help="Chiffrée dans le coffre, jamais enregistrée dans l’instance. Le champ est vidé dès l’envoi ; la clé ne sera plus jamais affichée."
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
            label="Nom dans le coffre"
            help="Proposé à partir de l’identifiant. Un nom déjà pris n’est jamais écrasé."
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
              label="Clé du coffre"
              placeholder="Choisir une clé…"
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
              help="Seuls les noms sont affichés, jamais les valeurs."
            />
          </div>
        </div>
      )}

      {keyState.mode === 'env' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id={`${uid}-env`}
            label="Nom de la variable"
            help="Le nom seulement (par exemple DEEPSEEK_API_KEY), jamais sa valeur."
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
              label="Durée de l’accord"
              options={GRANT_CHOICES_FR}
              value={String(keyState.grantMinutes)}
              onChange={(v) => onChange({ grantMinutes: Number(v) })}
            />
            <FieldNote
              id={`${uid}-grant`}
              help="Pendant cette durée, le serveur peut lire cette clé pour l’envoyer à ce provider, et à lui seul. Ensuite, renouvelez l’accord depuis le coffre."
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
        Référence enregistrée dans l’instance :{' '}
        <code data-testid="wizard-credential-ref" className="font-mono text-gray-200">
          {credentialRef}
        </code>
        {usesVault && (
          <>
            {' · '}
            <Link to={VAULT_PATH} className="text-indigo-400 underline hover:text-indigo-300">
              Ouvrir le coffre
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

const TASK_STATE_LABELS: Readonly<Record<TaskState, string>> = {
  todo: 'En attente',
  running: 'En cours…',
  done: 'Fait',
  error: 'Échec',
}

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
  return (
    <ol className={`${surface} divide-y divide-white/[0.05]`} aria-label="Ce que fait l’assistant">
      {plan.map((t) => (
        <li
          key={t}
          data-testid={`wizard-task-${t}`}
          data-state={tasks[t]}
          className="flex items-center gap-3 px-3 py-2.5"
        >
          <TaskIcon state={tasks[t]} />
          <span className="min-w-0 flex-1 text-sm text-gray-200">{TASK_LABELS[t]}</span>
          <span
            className={`text-xs ${tasks[t] === 'error' ? 'text-red-400' : tasks[t] === 'done' ? 'text-emerald-400' : 'text-gray-500'}`}
          >
            {TASK_STATE_LABELS[tasks[t]]}
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
  return (
    <div role="status" data-testid="wizard-test-result" className={`${surface} space-y-3 p-3`}>
      <div className="flex items-center gap-2">
        <Badge variant={verdict.ok ? 'success' : 'error'}>
          {verdict.ok ? 'Connexion OK' : 'Échec du test'}
        </Badge>
        <span className="text-sm text-gray-200">
          {verdict.ok ? 'La connexion fonctionne.' : 'La connexion ne fonctionne pas encore.'}
        </span>
      </div>
      <Facts
        columns={2}
        items={[
          {
            label: 'Modèle testé',
            value: testedModel ? (
              <span className="font-mono">{testedModel}</span>
            ) : (
              'aucun indiqué (le serveur sonde le premier de sa liste)'
            ),
          },
          { label: 'Joignable', value: verdict.reachable },
          { label: 'Modèles', value: verdict.models },
          { label: 'Appel d’outil', value: verdict.tools },
          { label: 'Fenêtre', value: verdict.context },
        ]}
      />
      {verdict.problem && (
        <p data-testid="wizard-test-problem" className="text-sm text-amber-200">
          {verdict.problem}
        </p>
      )}
      {verdict.loginHint && (
        <p className="text-xs text-gray-400">
          Commande à lancer sur le serveur :{' '}
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
  // Offered for the model that just PASSED, when the saved default is another one.
  const offerDefault =
    lastOk && !!testedModel && savedDefault !== null && savedDefault !== testedModel
  return (
    <div data-testid="wizard-model-picker" className={`${surface} space-y-3 p-3`}>
      {proposedMissing && (
        <p data-testid="wizard-model-missing" className="text-sm text-amber-200">
          Le modèle proposé par défaut ({proposedMissing}) n’est pas proposé par ce serveur. Le
          premier modèle listé est présélectionné ci-dessous.
        </p>
      )}
      {models.length > 8 ? (
        <ModelField
          id={`${uid}-model-to-test`}
          label="Modèle à tester"
          value={selected}
          onChange={onSelect}
          models={models.map((id) => ({ id }))}
          disabled={running}
          help={
            testedModel
              ? `Modèle testé : ${testedModel} (${lastOk ? 'réussi' : 'échec'}).`
              : undefined
          }
        />
      ) : (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-gray-300">Modèle à tester</legend>
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
                      ? 'Testé : réussi'
                      : 'Testé : échec'
                    : 'Pas encore testé'
                }
              />
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            L’appel d’outil dépend du modèle : un modèle qui échoue n’empêche pas un autre du même
            serveur de réussir.
          </p>
        </fieldset>
      )}
      <p data-testid="wizard-saved-default" className="text-xs text-gray-400">
        Modèle enregistré par défaut pour cette instance :{' '}
        {savedDefault ? (
          <code className="font-mono text-gray-200">{savedDefault}</code>
        ) : (
          'aucun (le serveur choisit le premier de sa liste)'
        )}
        .
      </p>
      {offerDefault && (
        <p data-testid="wizard-default-offer" className="text-sm text-emerald-300">
          {testedModel} a réussi le test, mais l’instance enregistre{' '}
          {savedDefault ? savedDefault : 'aucun modèle'} par défaut.
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
            Utiliser ce modèle par défaut
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          onClick={onTest}
          loading={running}
          disabled={!selected}
        >
          Tester ce modèle
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
  const project = projects?.find((p) => p.slug === projectSlug)
  return (
    <div className="space-y-6">
      <StepIntro
        title="4. Autoriser un projet"
        what="Choisissez un projet qui pourra envoyer son contenu (prompts, fichiers, résultats d’outils) à ce provider."
        why="Sans autorisation, un projet n’envoie rien ici. L’autorisation est liée à l’origine affichée et à la référence de clé : si l’une change, elle cesse de valoir. Cette étape est facultative."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <Select
            label="Projet"
            placeholder={
              projects === null
                ? 'Chargement…'
                : projects.length === 0
                  ? 'Aucun projet'
                  : 'Choisir un projet…'
            }
            options={(projects ?? []).map((p) => ({ value: p.slug, label: p.name }))}
            value={projectSlug}
            onChange={onProject}
            disabled={!projects || projects.length === 0}
          />
          <FieldNote
            id="wizard-project"
            help="Une conversation sans projet ne peut utiliser que Claude Code."
          />
        </div>
        <div className="min-w-0">
          <span className="mb-1 block text-sm font-medium text-gray-300">Origine</span>
          <p
            data-testid="wizard-origin"
            className={`${surface} break-all px-3 py-2 font-mono text-sm text-gray-200`}
          >
            {origin ?? 'inconnue'}
          </p>
          <FieldNote id="wizard-origin-note" help="L’endroit exact où le contenu partira." />
        </div>
      </div>
      {projectSlug && origin && !consented && (
        <div className={`${surface} flex flex-wrap items-center justify-between gap-3 p-3`}>
          <p className="min-w-0 flex-1 text-sm text-gray-300">
            Le contenu du projet <strong>{project?.name ?? projectSlug}</strong> sera envoyé à{' '}
            <code className="font-mono">{origin}</code>.
          </p>
          {allowButton}
        </div>
      )}
      {consented && (
        <p role="status" data-testid="wizard-consented" className="text-sm text-emerald-400">
          Projet {projects?.find((p) => p.slug === consented.slug)?.name ?? consented.slug} autorisé
          pour {consented.origin}.
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
