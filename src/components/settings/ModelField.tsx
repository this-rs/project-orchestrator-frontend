/**
 * Model picker fed by the provider's real catalog, with free typing as a
 * fallback (catalog empty, unavailable, or a model the endpoint does not list):
 *
 * ```
 * Modèle par défaut                                 [Actualiser]
 * [ filtre… ]                 (only when more than 8 models)
 * [ deepseek-v4-pro · outils · 1 048 576 tokens   v ]
 * help / capabilities / error
 * ```
 *
 * The choice "Saisir un autre nom…" switches to a text field. A value absent
 * from the catalog is kept and shown as such, never replaced silently.
 */
import { useId, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import type { ProviderModel } from '@/types/provider'
import { modelCapabilities } from '@/constants/providerWizard'
import { FIELD_LABEL, NativeSelect } from './FormField'

const OTHER = '__other__'
const NONE = ''

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
  const autoId = useId().replace(/:/g, '')
  const fieldId = id ?? `model-${autoId}`
  const [filter, setFilter] = useState('')
  const listed = !!models && models.some((m) => m.id === value)
  const [typing, setTyping] = useState(false)
  /** After "Actualiser": a short confirmation of what came back. */
  const [refreshed, setRefreshed] = useState(false)
  const free = typing || !models || models.length === 0 || (!!value && !listed)
  const shown = useMemo(() => {
    const all = models ?? []
    const q = filter.trim().toLowerCase()
    const hits = q
      ? all.filter((m) => m.id.toLowerCase().includes(q) || m.label?.toLowerCase().includes(q))
      : all
    // Keep the current choice visible even when filtered out.
    return value && listed && !hits.some((m) => m.id === value)
      ? [...all.filter((m) => m.id === value), ...hits]
      : hits
  }, [models, filter, value, listed])
  const current = models?.find((m) => m.id === value)
  const caps = modelCapabilities(current)

  let note: string
  if (refreshed && !loading && !error && models)
    note = `${models.length} modèle${models.length > 1 ? 's' : ''} trouvé${models.length > 1 ? 's' : ''}.`
  else if (error) note = `Catalogue indisponible : ${error} Saisissez le nom du modèle.`
  else if (loading && !models) note = 'Chargement du catalogue de modèles…'
  else if (models && models.length === 0)
    note = 'Ce provider ne liste aucun modèle : saisissez le nom.'
  else if (value && models && !listed)
    note = `« ${value} » n’est pas dans le catalogue de ce provider.`
  // The capabilities are already in the option label: the note keeps the help.
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
            aria-label={`Actualiser la liste des modèles (${label})`}
          >
            {!loading && <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}
            Actualiser
          </Button>
        )}
      </div>
      {!free && models && models.length > 8 && (
        <Input
          aria-label={`Filtrer les modèles de ${label}`}
          placeholder="Filtrer…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="mb-2"
        />
      )}
      {free ? (
        <div className="flex gap-2">
          <Input
            id={fieldId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="nom du modèle"
            autoComplete="off"
            spellCheck={false}
            aria-describedby={note ? `${fieldId}-note` : undefined}
          />
          {models && models.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setTyping(false)
                if (!listed) onChange(noneLabel !== undefined ? NONE : models[0].id)
              }}
            >
              Liste
            </Button>
          )}
        </div>
      ) : (
        <NativeSelect
          id={fieldId}
          value={value}
          disabled={disabled}
          aria-describedby={note ? `${fieldId}-note` : undefined}
          onChange={(e) => {
            if (e.target.value === OTHER) {
              setTyping(true)
              return
            }
            onChange(e.target.value)
          }}
        >
          {noneLabel !== undefined && <option value={NONE}>{noneLabel}</option>}
          {noneLabel === undefined && !value && <option value={NONE}>Choisir un modèle…</option>}
          {shown.map((m) => {
            const c = modelCapabilities(m)
            return (
              <option key={m.id} value={m.id}>
                {m.label ?? m.id}
                {c ? ` — ${c}` : ''}
              </option>
            )
          })}
          <option value={OTHER}>Saisir un autre nom…</option>
        </NativeSelect>
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
