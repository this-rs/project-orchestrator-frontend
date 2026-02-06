import { useState } from 'react'
import { Input, Textarea } from '@/components/ui'

export interface CreateStepFormData {
  description: string
  verification?: string
}

interface Props {
  onSubmit: (data: CreateStepFormData) => Promise<void>
  loading?: boolean
}

export function CreateStepForm({ onSubmit, loading }: Props) {
  const [description, setDescription] = useState('')
  const [verification, setVerification] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!description.trim()) errs.description = 'Description is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <Textarea
          label="Description"
          placeholder="What needs to be done in this step..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
          disabled={loading}
          autoFocus
          rows={3}
        />
        <Input
          label="Verification"
          placeholder="How to verify this step is complete (optional)"
          value={verification}
          onChange={(e) => setVerification(e.target.value)}
          disabled={loading}
        />
      </>
    ),
    submit: async () => {
      if (!validate()) return
      await onSubmit({
        description: description.trim(),
        verification: verification.trim() || undefined,
      })
    },
  }
}
