import { useState } from 'react'
import { Input, Textarea } from '@/components/ui'
import { useT } from '@/i18n'

export interface CreateStepFormData {
  description: string
  verification?: string
}

interface Props {
  onSubmit: (data: CreateStepFormData) => Promise<void>
}

export function CreateStepForm({ onSubmit }: Props) {
  const { t } = useT()
  const [description, setDescription] = useState('')
  const [verification, setVerification] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!description.trim()) errs.description = t('forms.error.description')
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <Textarea
          label={t('forms.field.description')}
          placeholder={t('forms.placeholder.stepDescription')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
          autoFocus
          rows={3}
        />
        <Input
          label={t('forms.field.verification')}
          placeholder={t('forms.placeholder.stepVerification')}
          value={verification}
          onChange={(e) => setVerification(e.target.value)}
        />
      </>
    ),
    submit: async () => {
      if (!validate()) return false
      await onSubmit({
        description: description.trim(),
        verification: verification.trim() || undefined,
      })
      // Fresh form for the next "Add step"
      setDescription('')
      setVerification('')
    },
  }
}
