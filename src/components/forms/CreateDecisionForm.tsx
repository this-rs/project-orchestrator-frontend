import { useState } from 'react'
import { Input, Textarea } from '@/components/ui'

export interface CreateDecisionFormData {
  description: string
  rationale: string
  alternatives: string[]
  chosen_option?: string
}

interface Props {
  onSubmit: (data: CreateDecisionFormData) => Promise<void>
}

export function CreateDecisionForm({ onSubmit }: Props) {
  const [description, setDescription] = useState('')
  const [rationale, setRationale] = useState('')
  const [alternatives, setAlternatives] = useState('')
  const [chosenOption, setChosenOption] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!description.trim()) errs.description = 'Description is required'
    if (!rationale.trim()) errs.rationale = 'Rationale is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <Input
          label="Description"
          placeholder="What was decided?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
          autoFocus
        />
        <Textarea
          label="Rationale"
          placeholder="Why was this decision made?"
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          error={errors.rationale}
          rows={3}
        />
        <Input
          label="Alternatives"
          placeholder="Comma-separated alternatives considered"
          value={alternatives}
          onChange={(e) => setAlternatives(e.target.value)}
        />
        <Input
          label="Chosen Option"
          placeholder="The selected option (optional)"
          value={chosenOption}
          onChange={(e) => setChosenOption(e.target.value)}
        />
      </>
    ),
    submit: async () => {
      if (!validate()) return false
      await onSubmit({
        description: description.trim(),
        rationale: rationale.trim(),
        alternatives: alternatives
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean),
        chosen_option: chosenOption.trim() || undefined,
      })
    },
  }
}
