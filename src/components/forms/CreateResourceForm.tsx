import { useState } from 'react'
import { Input, Textarea, Select } from '@/components/ui'
import type { ResourceType } from '@/types'
import { useT } from '@/i18n'

export interface CreateResourceFormData {
  name: string
  resource_type: ResourceType
  file_path: string
  url?: string
  format?: string
  version?: string
  description?: string
}

interface Props {
  onSubmit: (data: CreateResourceFormData) => Promise<void>
}

export function CreateResourceForm({ onSubmit }: Props) {
  const { t } = useT()
  const typeOptions = [
    { value: 'api_contract', label: t('forms.resourceType.api_contract') },
    { value: 'protobuf', label: t('forms.resourceType.protobuf') },
    { value: 'graphql_schema', label: t('forms.resourceType.graphql_schema') },
    { value: 'json_schema', label: t('forms.resourceType.json_schema') },
    { value: 'database_schema', label: t('forms.resourceType.database_schema') },
    { value: 'shared_types', label: t('forms.resourceType.shared_types') },
    { value: 'config', label: t('forms.resourceType.config') },
    { value: 'documentation', label: t('forms.resourceType.documentation') },
    { value: 'other', label: t('forms.other') },
  ]
  const [name, setName] = useState('')
  const [resourceType, setResourceType] = useState<string>('other')
  const [filePath, setFilePath] = useState('')
  const [url, setUrl] = useState('')
  const [format, setFormat] = useState('')
  const [version, setVersion] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = t('forms.error.name')
    if (!filePath.trim()) errs.file_path = t('forms.error.filePath')
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <Input
          label={t('forms.field.name')}
          placeholder={t('forms.placeholder.resourceName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}

          autoFocus
        />
        <Select
          label={t('forms.field.type')}
          options={typeOptions}
          value={resourceType}
          onChange={(value) => setResourceType(value)}

        />
        <Input
          label={t('forms.field.filePath')}
          placeholder="/path/to/resource"
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
          error={errors.file_path}

        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <Input
            label={t('forms.field.url')}
            placeholder="https://..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
  
          />
          <Input
            label={t('forms.field.format')}
            placeholder={t('forms.placeholder.format')}
            value={format}
            onChange={(e) => setFormat(e.target.value)}
  
          />
        </div>
        <Input
          label={t('forms.field.version')}
          placeholder="1.0.0"
          value={version}
          onChange={(e) => setVersion(e.target.value)}

        />
        <Textarea
          label={t('forms.field.description')}
          placeholder={t('forms.placeholder.optionalDescription')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}

          rows={2}
        />
      </>
    ),
    submit: async () => {
      if (!validate()) return false
      await onSubmit({
        name: name.trim(),
        resource_type: resourceType as ResourceType,
        file_path: filePath.trim(),
        url: url.trim() || undefined,
        format: format.trim() || undefined,
        version: version.trim() || undefined,
        description: description.trim() || undefined,
      })
    },
  }
}
