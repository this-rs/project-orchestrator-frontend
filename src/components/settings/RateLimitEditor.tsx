import { Plus, Trash2, Gauge } from 'lucide-react'
import { Button, CollapsibleSection, Input, Select } from '@/components/ui'
import { useT } from '@/i18n'
import {
  RATE_LIMIT_KINDS,
  RATE_LIMIT_UNITS,
  describeLimit,
  isCalendarWindow,
  validateLimit,
  windowsFor,
  windowLabel,
  type RateLimit,
  type RateLimitKind,
  type RateLimitScope,
  type RateLimitWindow,
} from '@/types/rateLimit'
import { FieldNote, FormField } from './FormField'

/**
 * The OPTIONAL "Limits" section of one provider instance (RL8).
 *
 * It writes the `rate_limit` list the backend stores (RL1) and validates it with
 * the very rules the backend enforces (max > 0, a whole number of requests or
 * tokens, a budget only per day/week/month, a known time zone exactly on a
 * calendar window, no duplicate kind+window+scope).
 *
 * With no limit configured the section is CLOSED and shows nothing but its
 * summary line: an instance without limits looks exactly as it did before this
 * section existed.
 */

/** A handful of the zones people actually reach for; the field also lists the ones the runtime knows. */
const COMMON_ZONES = [
  'utc',
  'Europe/Paris',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Dubai',
  'Australia/Sydney',
  'Pacific/Auckland',
]

const DEFAULT_LIMIT: RateLimit = { kind: 'requests', window: 'minute', calendar: null, max: 60, scope: 'instance' }

interface RateLimitEditorProps {
  value: RateLimit[]
  onChange: (next: RateLimit[]) => void
  /** The instance's own credential reference: the default of a credential scope. */
  credentialRef: string
  /** The models the instance lists (empty: the field is typed). */
  models: string[]
  /** Unique prefix for the control ids. */
  uid: string
}

export function RateLimitEditor({ value, onChange, credentialRef, models, uid }: RateLimitEditorProps) {
  const { t } = useT()

  const replace = (index: number, next: RateLimit) => onChange(value.map((l, i) => (i === index ? next : l)))
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index))

  const kindOptions = RATE_LIMIT_KINDS.map((k) => ({ value: k, label: t(kindKey(k)) }))
  const calendarOptions = COMMON_ZONES.map((z) => ({ value: z, label: z }))

  /** A limit that is not already there: "Add" never hands back an invalid row. */
  const freshLimit = (): RateLimit => {
    const taken = (window: RateLimitWindow) =>
      value.some((l) => l.kind === 'requests' && l.scope === 'instance' && sameWindow(l.window, window))
    for (const window of RATE_LIMIT_UNITS) {
      if (!taken(window)) return { ...DEFAULT_LIMIT, window }
    }
    for (const window of [{ rolling: 60 }] as RateLimitWindow[]) {
      if (!taken(window)) return { ...DEFAULT_LIMIT, window }
    }
    return { ...DEFAULT_LIMIT }
  }

  /** Changing the kind keeps the limit valid: a budget only has calendar windows. */
  const changeKind = (index: number, kind: RateLimitKind) => {
    const current = value[index]
    const windows = windowsFor(kind)
    const window = windows.some((w) => sameWindow(w, current.window)) ? current.window : windows[0]
    replace(index, { ...current, kind, window, calendar: calendarOf(window, current.calendar) })
  }

  const changeWindow = (index: number, window: RateLimitWindow) => {
    const current = value[index]
    replace(index, { ...current, window, calendar: calendarOf(window, current.calendar) })
  }

  const changeScope = (index: number, kind: 'instance' | 'credential' | 'model') => {
    const current = value[index]
    const defaultRef = credentialRef !== '' && credentialRef !== 'none' ? credentialRef : 'vault:'
    const scope: RateLimitScope =
      kind === 'instance'
        ? 'instance'
        : kind === 'credential'
          ? { credential: defaultRef }
          : { model: models[0] ?? '' }
    replace(index, { ...current, scope })
  }

  return (
    <div data-testid="rate-limits">
      <CollapsibleSection
        title={t('providerAdmin.limits.title')}
        icon={<Gauge className="w-4 h-4" aria-hidden />}
        description={t('providerAdmin.limits.description')}
        defaultOpen={value.length > 0}
      >
        {value.length === 0 ? (
          <p className="text-xs text-gray-500" data-testid="rate-limits-none">
            {t('providerAdmin.limits.none')}
          </p>
        ) : (
          <ul className="space-y-4">
            {value.map((limit, index) => {
              const why = validateLimit(limit, value, t)
              const preview = describeLimit(limit, t)
              const scopeKind = scopeKindOf(limit.scope)
              const calendar = isCalendarWindow(limit.window)
              const id = `${uid}-limit-${index}`
              return (
                <li key={id} data-testid="rate-limit-row" className="space-y-3 rounded-lg border border-white/[0.06] p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select
                      label={t('providerAdmin.limits.kind')}
                      options={kindOptions}
                      value={limit.kind}
                      onChange={(v) => changeKind(index, v as RateLimitKind)}
                    />
                    <Select
                      label={t('providerAdmin.limits.window')}
                      options={windowsFor(limit.kind).map((w) => ({ value: keyOfWindow(w), label: windowLabel(w, t) }))}
                      value={keyOfWindow(limit.window)}
                      onChange={(v) => changeWindow(index, windowOf(v))}
                    />
                    <FormField id={`${id}-max`} label={t('providerAdmin.limits.max')}>
                      <Input
                        id={`${id}-max`}
                        type="number"
                        min={limit.kind === 'budget_usd' ? 0.01 : 1}
                        step={limit.kind === 'budget_usd' ? '0.01' : '1'}
                        value={String(limit.max)}
                        onChange={(e) => replace(index, { ...limit, max: Number(e.target.value) })}
                        aria-invalid={!!why}
                      />
                    </FormField>
                    {calendar && (
                      <Select
                        label={t('providerAdmin.limits.calendar')}
                        options={calendarOptions}
                        value={limit.calendar ?? 'utc'}
                        onChange={(v) => replace(index, { ...limit, calendar: v })}
                      />
                    )}
                    <Select
                      label={t('providerAdmin.limits.scope')}
                      options={[
                        { value: 'instance', label: t('providerAdmin.limits.scopeInstance') },
                        { value: 'credential', label: t('providerAdmin.limits.scopeOptionCredential') },
                        { value: 'model', label: t('providerAdmin.limits.scopeOptionModel') },
                      ]}
                      value={scopeKind}
                      onChange={(v) => changeScope(index, v as 'instance' | 'credential' | 'model')}
                    />
                    {scopeKind === 'credential' && (
                      <FormField
                        id={`${id}-cred`}
                        label={t('providerAdmin.limits.credential')}
                        help={t('providerAdmin.limits.credentialHelp')}
                      >
                        <Input
                          id={`${id}-cred`}
                          value={credentialOf(limit.scope)}
                          onChange={(e) => replace(index, { ...limit, scope: { credential: e.target.value } })}
                          placeholder="vault:deepseek"
                          autoComplete="off"
                        />
                      </FormField>
                    )}
                    {scopeKind === 'model' &&
                      (models.length > 0 ? (
                        <Select
                          label={t('providerAdmin.limits.model')}
                          options={models.map((m) => ({ value: m, label: m }))}
                          value={modelOf(limit.scope)}
                          onChange={(v) => replace(index, { ...limit, scope: { model: v } })}
                        />
                      ) : (
                        <FormField id={`${id}-model`} label={t('providerAdmin.limits.model')}>
                          <Input
                            id={`${id}-model`}
                            value={modelOf(limit.scope)}
                            onChange={(e) => replace(index, { ...limit, scope: { model: e.target.value } })}
                            placeholder="deepseek-chat"
                            autoComplete="off"
                          />
                        </FormField>
                      ))}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-gray-400" data-testid="rate-limit-preview">
                      {preview}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => remove(index)}
                      aria-label={`${t('providerAdmin.limits.remove')} — ${preview}`}
                      data-testid="rate-limit-remove"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden />
                    </Button>
                  </div>
                  {why && <FieldNote id={`${id}-why`} error={why} />}
                </li>
              )
            })}
          </ul>
        )}
        <div className="mt-3">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => onChange([...value, freshLimit()])}
            data-testid="rate-limit-add"
          >
            <Plus className="w-4 h-4" aria-hidden />
            {t('providerAdmin.limits.add')}
          </Button>
        </div>
      </CollapsibleSection>
    </div>
  )
}

function kindKey(kind: RateLimitKind) {
  if (kind === 'requests') return 'providerAdmin.limits.kindRequests' as const
  if (kind === 'tokens') return 'providerAdmin.limits.kindTokens' as const
  return 'providerAdmin.limits.kindBudget' as const
}

/** A window as the `Select` names it (`{"rolling":60}` → `rolling:60`). */
function keyOfWindow(w: RateLimitWindow): string {
  return typeof w === 'string' ? w : `rolling:${w.rolling}`
}

function windowOf(key: string): RateLimitWindow {
  return key.startsWith('rolling:') ? { rolling: Number(key.slice(8)) } : (key as RateLimitWindow)
}

function sameWindow(a: RateLimitWindow, b: RateLimitWindow): boolean {
  return keyOfWindow(a) === keyOfWindow(b)
}

/** A calendar window always carries a zone; a rate window never does. */
function calendarOf(window: RateLimitWindow, current: string | null): string | null {
  if (!isCalendarWindow(window)) return null
  return current ?? 'utc'
}

function scopeKindOf(scope: RateLimitScope): 'instance' | 'credential' | 'model' {
  if (scope === 'instance') return 'instance'
  return 'credential' in scope ? 'credential' : 'model'
}

function credentialOf(scope: RateLimitScope): string {
  return scope !== 'instance' && 'credential' in scope ? scope.credential : ''
}

function modelOf(scope: RateLimitScope): string {
  return scope !== 'instance' && 'model' in scope ? scope.model : ''
}
