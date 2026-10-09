/**
 * Decision forms rendered inside a <FormDialog>: edit the context
 * (description, rationale, chosen option) and link an affected code entity.
 * Same shape as NoteForms: each hook returns `{ fields, submit, reset }`;
 * `submit` returns `false` to keep the dialog open.
 */
import { useState } from 'react'
import { Input, Select, Textarea } from '@/components/ui'
import { useT } from '@/i18n'

// ── Edit context ────────────────────────────────────────────────────────

export interface EditDecisionFormData {
  description: string
  rationale: string
  chosen_option?: string
}

export function useEditDecisionForm(onSubmit: (data: EditDecisionFormData) => Promise<void>) {
  const { t } = useT()
  const [description, setDescription] = useState('')
  const [rationale, setRationale] = useState('')
  const [chosen, setChosen] = useState('')
  const [error, setError] = useState<string | undefined>()

  return {
    reset: (initial: EditDecisionFormData) => {
      setDescription(initial.description)
      setRationale(initial.rationale)
      setChosen(initial.chosen_option ?? '')
      setError(undefined)
    },
    fields: (
      <>
        <Textarea
          label={t('forms.field.description')}
          aria-label={t('forms.field.description')}
          placeholder={t('forms.placeholder.decisionEdit')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={error}
          rows={3}
          autoFocus
        />
        <Textarea
          label={t('forms.field.rationale')}
          aria-label={t('forms.field.rationale')}
          placeholder={t('forms.placeholder.rationaleEdit')}
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          rows={6}
        />
        <Input
          label={t('forms.field.chosenOption')}
          aria-label={t('forms.field.chosenOption')}
          placeholder={t('forms.placeholder.optionExample')}
          value={chosen}
          onChange={(e) => setChosen(e.target.value)}
        />
      </>
    ),
    submit: async () => {
      if (!description.trim()) {
        setError(t('forms.error.description'))
        return false
      }
      await onSubmit({ description: description.trim(), rationale: rationale.trim(), chosen_option: chosen.trim() || undefined })
    },
  }
}

// ── Affected entity ─────────────────────────────────────────────────────

export const DECISION_AFFECTS_TYPES = [
  { value: 'File', label: 'forms.entityType.file' },
  { value: 'Function', label: 'forms.entityType.function' },
  { value: 'Struct', label: 'forms.entityType.struct' },
  { value: 'Trait', label: 'forms.entityType.trait' },
] as const

export interface DecisionAffectsFormData {
  entity_type: string
  entity_id: string
  impact_description?: string
}

export function useDecisionAffectsForm(onSubmit: (data: DecisionAffectsFormData) => Promise<void>) {
  const { t } = useT()
  const [entityType, setEntityType] = useState('File')
  const [entityId, setEntityId] = useState('')
  const [impact, setImpact] = useState('')
  const [error, setError] = useState<string | undefined>()

  return {
    reset: () => {
      setEntityType('File')
      setEntityId('')
      setImpact('')
      setError(undefined)
    },
    fields: (
      <>
        <Select label={t('forms.field.entityType')} options={DECISION_AFFECTS_TYPES.map((o) => ({ value: o.value, label: t(o.label) }))} value={entityType} onChange={setEntityType} />
        <Input
          label={t('forms.field.entity')}
          aria-label={t('forms.field.entity')}
          placeholder={entityType === 'File' ? 'src/api/handlers.rs' : t('forms.placeholder.entityName', { type: entityType })}
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          error={error}
          autoFocus
        />
        <Textarea
          label={t('forms.field.impact')}
          aria-label={t('forms.field.impact')}
          placeholder={t('forms.placeholder.impact')}
          value={impact}
          onChange={(e) => setImpact(e.target.value)}
          rows={3}
        />
      </>
    ),
    submit: async () => {
      if (!entityId.trim()) {
        setError(t('forms.error.required'))
        return false
      }
      await onSubmit({ entity_type: entityType, entity_id: entityId.trim(), impact_description: impact.trim() || undefined })
    },
  }
}
