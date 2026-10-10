/**
 * Model picker fed by the provider's real catalog: a searchable list, with
 * free typing as a fallback.
 *
 * ```
 * Default model                                    [Refresh]
 * [ deepseek-v4-pro                               v ]   search + list
 *   (list: "3 of 12", capabilities under each model, “Use ‘x’”)
 * help / capabilities / error
 * ```
 *
 * With no catalog (not loaded, empty, or failed) the field is a plain text
 * input. With one, a model the endpoint does not list is typed in the search
 * and chosen with « Utiliser “…” ». A value absent from the catalog is kept
 * and shown as such, never replaced silently.
 */
import { useId, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button, Input, SearchableSelect, type SearchableOption } from '@/components/ui'
import type { ProviderModel } from '@/types/provider'
import { modelCapabilities } from '@/constants/providerWizard'
import { useT } from '@/i18n'
import { FIELD_LABEL } from './FormField'

interface ModelFieldProps {
  id?: string
  label: string
  value: string
  onChange: (model: string) => void
  /** `null` = not loaded (or no catalog): free typing. */
  models: ProviderModel[] | null
  loading?: boolean
  error?: string | null
  onRefresh?: () => void
  /** Label of the empty choice; omit to make a model mandatory. */
  noneLabel?: string
  help?: string
  disabled?: boolean
}

export function ModelField({
  id,
  label,
  value,
  onChange,
  models,
  loading,
  error,
  onRefresh,
  noneLabel,
  help,
  disabled,
}: ModelFieldProps) {
  const tr = useT()
  const { t } = tr
  const MODEL_NOUN = { one: t('providerAdmin.models.nounOne'), other: t('providerAdmin.models.nounOther') }
  const autoId = useId().replace(/:/g, '')
  const fieldId = id ?? `model-${autoId}`
  const listed = !!models && models.some((m) => m.id === value)
  /** After "Refresh": a short confirmation of what came back. */
  const [refreshed, setRefreshed] = useState(false)
  const free = !models || models.length === 0
  const options = useMemo<SearchableOption[]>(
    () =>
      (models ?? []).map((m) => {
        const caps = modelCapabilities(tr, m)
        return {
          value: m.id,
          label: m.label ?? m.id,
          description: [m.label && m.label !== m.id ? m.id : null, caps].filter(Boolean).join(' · ') || undefined,
        }
      }),
    [models, tr],
  )
  const current = models?.find((m) => m.id === value)
  const caps = modelCapabilities(tr, current)

  let note: string
  if (refreshed && !loading && !error && models)
    note = t(models.length === 1 ? 'providerAdmin.models.foundOne' : 'providerAdmin.models.foundMany', { n: models.length })
  else if (error) note = t('providerAdmin.models.unavailable', { error })
  else if (loading && !models) note = t('providerAdmin.models.loading')
  else if (models && models.length === 0) note = t('providerAdmin.models.empty')
  else if (value && models && !listed) note = t('providerAdmin.models.notInCatalog', { value })
  // The capabilities are already under each option: the note keeps the help.
  else note = help ?? caps ?? ''

  return (
    <div className="min-w-0" data-testid="model-field">
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={fieldId} className={FIELD_LABEL.replace('mb-1', '')}>
          {label}
        </label>
        {onRefresh && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setRefreshed(true)
              onRefresh()
            }}
            loading={loading}
            disabled={disabled}
            className="-my-2 -mr-3"
            aria-label={t('providerAdmin.models.refreshAria', { label })}
          >
            {!loading && <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}
            {t('providerAdmin.ui.refresh')}
          </Button>
        )}
      </div>
      {free ? (
        <Input
          id={fieldId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={t('providerAdmin.models.namePlaceholder')}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={note ? `${fieldId}-note` : undefined}
        />
      ) : (
        <SearchableSelect
          id={fieldId}
          value={value}
          onChange={onChange}
          options={options}
          noneLabel={noneLabel}
          allowCustom
          noun={MODEL_NOUN}
          placeholder={noneLabel === undefined ? t('providerAdmin.models.choose') : undefined}
          loading={loading}
          disabled={disabled}
          aria-describedby={note ? `${fieldId}-note` : undefined}
        />
      )}
      {note && (
        <p
          id={`${fieldId}-note`}
          className={`mt-1 text-xs ${error ? 'text-amber-300' : 'text-gray-500'}`}
        >
          {note}
        </p>
      )}
    </div>
  )
}
