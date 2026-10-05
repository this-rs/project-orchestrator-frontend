import { useId } from 'react'
import { useAtomValue } from 'jotai'
import { Link } from 'react-router-dom'
import { providersAtom } from '@/atoms'
import { aliasesForInstance, healthDotColor, healthLabel, providerUnavailableReason } from '@/constants/providers'
import {
  RUN_TARGET_CONSENT_LINK,
  RUN_TARGET_DEFAULT_MODEL,
  RUN_TARGET_LABEL,
  RUN_TARGET_NO_PRICE_TEXT,
  RUN_TARGET_THIRD_PARTY_TEXT,
  hasKnownPrice,
  isThirdParty,
  serverDefaultLabel,
} from '@/constants/runProviders'
import type { RunTarget } from '@/hooks/useRunTarget'
import { providerKindLabel } from '@/types/provider'

interface RunTargetPickerProps {
  target: RunTarget
}

const SELECT =
  'w-full px-2 py-1.5 bg-white/[0.06] border border-white/[0.08] rounded-lg text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500/50'

/**
 * Provider, then model, of a run about to start — decided BEFORE launch, with
 * the rules that follow from it said up front (third-party provider: no
 * bypass; no price: no USD budget; project not allowed: not selectable, and the
 * way to allow it is one link away). Renders nothing on a backend without
 * provider routes or with a single instance.
 */
export function RunTargetPicker({ target }: RunTargetPickerProps) {
  const base = useId()
  const table = useAtomValue(providersAtom)
  const { visible, choice, setChoice, instance, providers } = target
  if (!visible) return null

  const resolved = table?.default ?? null
  const aliases = aliasesForInstance(instance, table?.aliases)
  const aliasNames = new Set(aliases.map((a) => a.alias))
  const models = (instance?.models ?? []).filter((m) => !aliasNames.has(m.id))
  const anyNotAllowed = providers.some((p) => p.allowed_for_project === false)
  const thirdParty = isThirdParty(instance)
  const unpriced = !hasKnownPrice(instance)

  return (
    <div data-testid="run-target" className="p-3 bg-white/[0.04] rounded-lg space-y-2">
      <span id={`${base}-label`} className="text-sm font-medium text-gray-300">
        {RUN_TARGET_LABEL}
      </span>

      <div role="radiogroup" aria-labelledby={`${base}-label`} className="space-y-1">
        <ProviderRow
          id={`${base}-default`}
          checked={choice.provider === null}
          onSelect={() => setChoice({ provider: null, model: null })}
          label={serverDefaultLabel(providers, resolved)}
        />
        {providers.map((p) => {
          const reason = providerUnavailableReason(p)
          return (
            <ProviderRow
              key={p.id}
              id={`${base}-${p.id}`}
              checked={choice.provider === p.id}
              onSelect={() => !reason && setChoice({ provider: p.id, model: null })}
              label={p.label || p.id}
              kind={providerKindLabel(p.kind)}
              dot={healthDotColor(p.health?.status)}
              health={healthLabel(p.health?.status)}
              disabledReason={reason}
            />
          )
        })}
      </div>

      {anyNotAllowed && (
        <Link to="/providers#consent" className="inline-block text-xs text-indigo-300 hover:text-indigo-200 underline underline-offset-2">
          {RUN_TARGET_CONSENT_LINK}
        </Link>
      )}

      {instance && (aliases.length > 0 || models.length > 0) && (
        <div>
          <label htmlFor={`${base}-model`} className="block text-xs text-gray-400 mb-1">
            Model
          </label>
          <select
            id={`${base}-model`}
            className={SELECT}
            value={choice.model ?? ''}
            onChange={(e) => setChoice({ ...choice, model: e.target.value || null })}
          >
            <option value="">{RUN_TARGET_DEFAULT_MODEL}</option>
            {aliases.length > 0 && (
              <optgroup label="Aliases">
                {aliases.map((a) => (
                  <option key={a.alias} value={a.alias}>
                    {a.alias} ({a.model})
                  </option>
                ))}
              </optgroup>
            )}
            {models.length > 0 && (
              <optgroup label="Models">
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label || m.id}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      )}

      {thirdParty && (
        <p data-testid="run-target-third-party" className="text-xs text-gray-400">
          {RUN_TARGET_THIRD_PARTY_TEXT}
        </p>
      )}
      {unpriced && (
        <p data-testid="run-target-no-price" className="text-xs text-amber-300">
          {RUN_TARGET_NO_PRICE_TEXT}
        </p>
      )}
    </div>
  )
}

function ProviderRow({
  id,
  checked,
  onSelect,
  label,
  kind,
  dot,
  health,
  disabledReason,
}: {
  id: string
  checked: boolean
  onSelect: () => void
  label: string
  kind?: string
  dot?: string
  health?: string
  disabledReason?: string | null
}) {
  const reasonId = `${id}-reason`
  return (
    // Kept focusable and announced as disabled, the reason being visible text:
    // a greyed-out row that says nothing reads as a bug.
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-disabled={disabledReason ? true : undefined}
      aria-describedby={disabledReason ? reasonId : undefined}
      onClick={onSelect}
      className={`w-full text-left px-2 py-1.5 rounded-md text-xs border ${
        disabledReason
          ? 'text-gray-500 cursor-not-allowed border-transparent'
          : checked
            ? 'text-gray-100 bg-white/[0.06] border-indigo-500/40'
            : 'text-gray-400 hover:bg-white/[0.04] border-transparent'
      }`}
    >
      <span className="flex items-center gap-1.5">
        {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} aria-hidden="true" />}
        {health && <span className="sr-only">{health}:</span>}
        <span className="truncate">{label}</span>
        {kind && <span className="text-[10px] text-gray-500 shrink-0">{kind}</span>}
      </span>
      {disabledReason && (
        <span id={reasonId} className="mt-0.5 block text-[10px] text-gray-500">
          {disabledReason}
        </span>
      )}
    </button>
  )
}
