import { useEffect, useState } from 'react'
import { Input, Textarea, Select } from '@/components/ui'
import type { Persona } from '@/types'

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

const complexityOptions = [
  { value: '', label: 'Automatic' },
  { value: 'simple', label: 'Simple' },
  { value: 'complex', label: 'Complex' },
  { value: 'creative', label: 'Creative' },
]

const inputSize = 'text-base md:text-sm'

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
    if (!name.trim()) errs.name = 'Name is required'
    if (timeout.trim() && positive(timeout) === undefined) errs.timeout = 'Must be a positive number'
    if (maxCost.trim() && positive(maxCost) === undefined) errs.maxCost = 'Must be a positive number'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <Input label="Name" className={inputSize} value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <Textarea
          label="Description"
          className={inputSize}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Model preference"
            className={inputSize}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="opus, sonnet, haiku…"
          />
          <Select label="Default complexity" options={complexityOptions} value={complexity} onChange={setComplexity} />
          <Input
            label="Timeout (seconds)"
            type="number"
            inputMode="numeric"
            min={1}
            className={inputSize}
            value={timeout}
            onChange={(e) => setTimeoutSecs(e.target.value)}
            error={errors.timeout}
          />
          <Input
            label="Max cost (USD)"
            type="number"
            inputMode="decimal"
            step="0.1"
            min={0}
            className={inputSize}
            value={maxCost}
            onChange={(e) => setMaxCost(e.target.value)}
            error={errors.maxCost}
          />
        </div>
        <Textarea
          label="System prompt override"
          className={`${inputSize} font-mono`}
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Optional — replaces the default system prompt for agents using this persona"
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
