import { useState } from 'react'
import { Input, Select } from '@/components/ui'
import type { ConstraintType } from '@/types'

export interface CreateConstraintFormData {
  constraint_type: ConstraintType
  description: string
  severity?: string
}

interface Props {
  onSubmit: (data: CreateConstraintFormData) => Promise<void>
  loading?: boolean
}

const typeOptions = [
  { value: 'performance', label: 'Performance' },
  { value: 'security', label: 'Security' },
  { value: 'style', label: 'Style' },
  { value: 'compatibility', label: 'Compatibility' },
  { value: 'testing', label: 'Testing' },
  { value: 'other', label: 'Other' },
]

const severityOptions = [
  { value: '', label: 'No severity' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]

export function CreateConstraintForm({ onSubmit, loading }: Props) {
  const [constraintType, setConstraintType] = useState<string>('other')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState('')
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <Select
            label="Type"
            options={typeOptions}
            value={constraintType}
            onChange={(value) => setConstraintType(value)}
            disabled={loading}
          />
          <Select
            label="Severity"
            options={severityOptions}
            value={severity}
            onChange={(value) => setSeverity(value)}
            disabled={loading}
          />
        </div>
        <Input
          label="Description"
          placeholder="Describe the constraint..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
          disabled={loading}
          autoFocus
        />
      </>
    ),
    submit: async () => {
      if (!validate()) return
      await onSubmit({
        constraint_type: constraintType as ConstraintType,
        description: description.trim(),
        severity: severity || undefined,
      })
    },
  }
}
