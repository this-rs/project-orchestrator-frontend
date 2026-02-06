import { useState } from 'react'
import { Input, Textarea, Select } from '@/components/ui'
import type { ResourceType } from '@/types'

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
  loading?: boolean
}

const typeOptions = [
  { value: 'api_contract', label: 'API Contract' },
  { value: 'protobuf', label: 'Protobuf' },
  { value: 'graphql_schema', label: 'GraphQL Schema' },
  { value: 'json_schema', label: 'JSON Schema' },
  { value: 'database_schema', label: 'Database Schema' },
  { value: 'shared_types', label: 'Shared Types' },
  { value: 'config', label: 'Config' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'other', label: 'Other' },
]

export function CreateResourceForm({ onSubmit, loading }: Props) {
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
    if (!name.trim()) errs.name = 'Name is required'
    if (!filePath.trim()) errs.file_path = 'File path is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <Input
          label="Name"
          placeholder="Resource name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          disabled={loading}
          autoFocus
        />
        <Select
          label="Type"
          options={typeOptions}
          value={resourceType}
          onChange={(e) => setResourceType(e.target.value)}
          disabled={loading}
        />
        <Input
          label="File Path"
          placeholder="/path/to/resource"
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
          error={errors.file_path}
          disabled={loading}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="URL"
            placeholder="https://..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading}
          />
          <Input
            label="Format"
            placeholder="json, yaml, etc."
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            disabled={loading}
          />
        </div>
        <Input
          label="Version"
          placeholder="1.0.0"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          disabled={loading}
        />
        <Textarea
          label="Description"
          placeholder="Optional description..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={loading}
          rows={2}
        />
      </>
    ),
    submit: async () => {
      if (!validate()) return
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
