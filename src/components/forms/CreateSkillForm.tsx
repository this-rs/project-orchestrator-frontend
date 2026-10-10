import { useState } from 'react'
import { Input, Textarea, Select } from '@/components/ui'
import type { CreateSkillRequest } from '@/types'
import { useT } from '@/i18n'

interface Props {
  projects: { id: string; name: string }[]
  onSubmit: (data: CreateSkillRequest) => Promise<void>
}

export function CreateSkillForm({ projects, onSubmit }: Props) {
  const { t } = useT()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState(projects[0]?.id || '')
  const [tags, setTags] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }))
  // 16px on phones so iOS Safari does not zoom on focus (DESIGN §10)

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = t('forms.error.name')
    if (!projectId) errs.project_id = t('forms.error.project')
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <Select
          label={t('forms.field.project')}
          options={projectOptions}
          value={projectId}
          onChange={setProjectId}
          error={errors.project_id}
        />
        <Input
          label={t('forms.field.name')}
          placeholder={t('forms.placeholder.skillName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          autoFocus
        />
        <Textarea
          label={t('forms.field.description')}
          placeholder={t('forms.placeholder.skillDescription')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
        <Input
          label={t('forms.field.tags')}
          placeholder={t('forms.placeholder.tagsOptional')}
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </>
    ),
    submit: async () => {
      if (!validate()) return false
      const tagList = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      await onSubmit({
        project_id: projectId,
        name: name.trim(),
        description: description.trim() || undefined,
        tags: tagList.length > 0 ? tagList : undefined,
      })
    },
  }
}
