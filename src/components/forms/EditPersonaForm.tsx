import { useEffect, useState } from 'react'
import { Input, Textarea, Select } from '@/components/ui'
import type { Persona } from '@/types'
import { useT } from '@/i18n'

export interface EditPersonaFormData {
  name: string
  description: string
  complexity_default?: string
  timeout_secs?: number
  max_cost_usd?: number
  model_preference?: string
  system_prompt_override?: string
}

interface Props {
  initial: Persona
  onSubmit: (data: EditPersonaFormData) => Promise<void>
}



/** Positive number or undefined (empty / invalid input is not sent). */
function positive(v: string): number | undefined {
  const n = Number(v)
  return v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : undefined
}

/**
 * Persona identity + execution parameters. Returns `{ fields, submit }` like
 * the other forms (render `fields` inside a FormDialog).
 */
export function EditPersonaForm({ initial, onSubmit }: Props) {
  const { t } = useT()
  const complexityOptions = [
    { value: '', label: t('forms.persona.complexityAuto') },
    { value: 'simple', label: t('forms.persona.complexitySimple') },
    { value: 'complex', label: t('forms.persona.complexityComplex') },
    { value: 'creative', label: t('forms.persona.complexityCreative') },
  ]
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description ?? '')
  const [model, setModel] = useState(initial.model_preference ?? '')
  const [complexity, setComplexity] = useState(initial.complexity_default ?? '')
  const [timeout, setTimeoutSecs] = useState(initial.timeout_secs != null ? String(initial.timeout_secs) : '')
  const [maxCost, setMaxCost] = useState(initial.max_cost_usd != null ? String(initial.max_cost_usd) : '')
  const [prompt, setPrompt] = useState(initial.system_prompt_override ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Re-sync when the persona changes (dialog reopened after an update)
  useEffect(() => {
    setName(initial.name)
    setDescription(initial.description ?? '')
    setModel(initial.model_preference ?? '')
    setComplexity(initial.complexity_default ?? '')
    setTimeoutSecs(initial.timeout_secs != null ? String(initial.timeout_secs) : '')
    setMaxCost(initial.max_cost_usd != null ? String(initial.max_cost_usd) : '')
    setPrompt(initial.system_prompt_override ?? '')
    setErrors({})
  }, [initial])

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = t('forms.error.name')
    if (timeout.trim() && positive(timeout) === undefined) errs.timeout = t('forms.error.positive')
    if (maxCost.trim() && positive(maxCost) === undefined) errs.maxCost = t('forms.error.positive')
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <Input label={t('forms.field.name')} value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <Textarea
          label={t('forms.field.description')}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label={t('forms.persona.modelPreference')}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={t('forms.placeholder.modelPreference')}
          />
          <Select label={t('forms.persona.defaultComplexity')} options={complexityOptions} value={complexity} onChange={setComplexity} />
          <Input
            label={t('forms.persona.timeout')}
            type="number"
            inputMode="numeric"
            min={1}
            value={timeout}
            onChange={(e) => setTimeoutSecs(e.target.value)}
            error={errors.timeout}
          />
          <Input
            label={t('forms.persona.maxCost')}
            type="number"
            inputMode="decimal"
            step="0.1"
            min={0}
            value={maxCost}
            onChange={(e) => setMaxCost(e.target.value)}
            error={errors.maxCost}
          />
        </div>
        <Textarea
          label={t('forms.persona.systemPrompt')}
          className="font-mono"
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('forms.persona.systemPromptPlaceholder')}
        />
      </>
    ),
    submit: async () => {
      if (!validate()) return false
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        complexity_default: complexity || undefined,
        timeout_secs: positive(timeout),
        max_cost_usd: positive(maxCost),
        model_preference: model.trim() || undefined,
        system_prompt_override: prompt.trim() || undefined,
      })
    },
  }
}
