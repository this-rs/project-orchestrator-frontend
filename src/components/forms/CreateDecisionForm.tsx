import { useState } from 'react'
import { Input, Textarea } from '@/components/ui'
import { useT } from '@/i18n'

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
  const { t } = useT()
  const [description, setDescription] = useState('')
  const [rationale, setRationale] = useState('')
  const [alternatives, setAlternatives] = useState('')
  const [chosenOption, setChosenOption] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!description.trim()) errs.description = t('forms.error.description')
    if (!rationale.trim()) errs.rationale = t('forms.error.rationale')
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <Input
          label={t('forms.field.description')}
          placeholder={t('forms.placeholder.decision')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
          autoFocus
        />
        <Textarea
          label={t('forms.field.rationale')}
          placeholder={t('forms.placeholder.rationale')}
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          error={errors.rationale}
          rows={3}
        />
        <Input
          label={t('forms.field.alternatives')}
          placeholder={t('forms.placeholder.alternatives')}
          value={alternatives}
          onChange={(e) => setAlternatives(e.target.value)}
        />
        <Input
          label={t('forms.field.chosenOption')}
          placeholder={t('forms.placeholder.chosenOption')}
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
