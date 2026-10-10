import { useState, useEffect } from 'react'
import { Input, Textarea } from '@/components/ui'
import { useT } from '@/i18n'

export interface EditStepFormData {
  description: string
  verification: string
}

interface Props {
  initialValues: { description: string; verification?: string }
  onSubmit: (data: EditStepFormData) => Promise<void>
  loading?: boolean
}

export function EditStepForm({ initialValues, onSubmit, loading }: Props) {
  const { t } = useT()
  const [description, setDescription] = useState(initialValues.description)
  const [verification, setVerification] = useState(initialValues.verification ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setDescription(initialValues.description)
    setVerification(initialValues.verification ?? '')
    setErrors({})
  }, [initialValues.description, initialValues.verification])

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
          placeholder={t('forms.placeholder.stepDescriptionEdit')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
          disabled={loading}
          rows={3}
        />
        <Input
          label={t('forms.field.verification')}
          placeholder={t('forms.placeholder.stepVerificationEdit')}
          value={verification}
          onChange={(e) => setVerification(e.target.value)}
          disabled={loading}
        />
      </>
    ),
    submit: async () => {
      if (!validate()) return false
      await onSubmit({
        description: description.trim(),
        verification: verification.trim(),
      })
    },
  }
}
