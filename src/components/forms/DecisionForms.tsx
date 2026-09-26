/**
 * Decision forms rendered inside a <FormDialog>: edit the context
 * (description, rationale, chosen option) and link an affected code entity.
 * Same shape as NoteForms: each hook returns `{ fields, submit, reset }`;
 * `submit` returns `false` to keep the dialog open.
 */
import { useState } from 'react'
import { Input, Select, Textarea } from '@/components/ui'

// ── Edit context ────────────────────────────────────────────────────────

export interface EditDecisionFormData {
  description: string
  rationale: string
  chosen_option?: string
}

export function useEditDecisionForm(onSubmit: (data: EditDecisionFormData) => Promise<void>) {
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
          label="Description"
          aria-label="Description"
          placeholder="What was decided? The first line is the title."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={error}
          rows={3}
          autoFocus
        />
        <Textarea
          label="Rationale"
          aria-label="Rationale"
          placeholder="Why this decision was made"
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          rows={6}
        />
        <Input
          label="Chosen option"
          aria-label="Chosen option"
          placeholder="e.g. Option A"
          value={chosen}
          onChange={(e) => setChosen(e.target.value)}
        />
      </>
    ),
    submit: async () => {
      if (!description.trim()) {
        setError('Description is required')
        return false
      }
      await onSubmit({ description: description.trim(), rationale: rationale.trim(), chosen_option: chosen.trim() || undefined })
    },
  }
}

// ── Affected entity ─────────────────────────────────────────────────────

export const DECISION_AFFECTS_TYPES = [
  { value: 'File', label: 'File' },
  { value: 'Function', label: 'Function' },
  { value: 'Struct', label: 'Struct' },
  { value: 'Trait', label: 'Trait' },
]

export interface DecisionAffectsFormData {
  entity_type: string
  entity_id: string
  impact_description?: string
}

export function useDecisionAffectsForm(onSubmit: (data: DecisionAffectsFormData) => Promise<void>) {
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
        <Select label="Entity type" options={DECISION_AFFECTS_TYPES} value={entityType} onChange={setEntityType} />
        <Input
          label="Entity"
          aria-label="Entity"
          placeholder={entityType === 'File' ? 'src/api/handlers.rs' : `${entityType} name`}
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          error={error}
          autoFocus
        />
        <Textarea
          label="Impact"
          aria-label="Impact"
          placeholder="How this decision constrains it (optional)"
          value={impact}
          onChange={(e) => setImpact(e.target.value)}
          rows={3}
        />
      </>
    ),
    submit: async () => {
      if (!entityId.trim()) {
        setError('Required')
        return false
      }
      await onSubmit({ entity_type: entityType, entity_id: entityId.trim(), impact_description: impact.trim() || undefined })
    },
  }
}
