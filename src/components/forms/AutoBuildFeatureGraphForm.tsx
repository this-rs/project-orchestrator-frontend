import { useState } from 'react'
import { Input, Textarea, Select } from '@/components/ui'
import type { AutoBuildFeatureGraphRequest } from '@/types'
import { useT } from '@/i18n'

interface Props {
  projects: { id: string; name: string }[]
  onSubmit: (data: AutoBuildFeatureGraphRequest) => Promise<void>
}

const RELATION_OPTIONS = [
  { key: 'CALLS', label: 'forms.autoBuild.calls', defaultOn: true },
  { key: 'IMPORTS', label: 'forms.autoBuild.imports', defaultOn: true },
  { key: 'EXTENDS', label: 'forms.autoBuild.extends', defaultOn: false },
  { key: 'IMPLEMENTS', label: 'forms.autoBuild.implements', defaultOn: false },
] as const

export function AutoBuildFeatureGraphForm({ projects, onSubmit }: Props) {
  const { t } = useT()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState(projects[0]?.id || '')
  const [entryFunction, setEntryFunction] = useState('')
  const [depth, setDepth] = useState(2)
  const [relations, setRelations] = useState<Record<string, boolean>>(
    Object.fromEntries(RELATION_OPTIONS.map((r) => [r.key, r.defaultOn])),
  )
  const [filterCommunity, setFilterCommunity] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }))

  const toggleRelation = (key: string) => {
    setRelations((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = t('forms.error.name')
    if (!projectId) errs.project_id = t('forms.error.project')
    if (!entryFunction.trim()) errs.entry_function = t('forms.error.entryFunction')
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <div className="space-y-4">
        <Select
          label={t('forms.field.project')}
          options={projectOptions}
          value={projectId}
          onChange={setProjectId}
          error={errors.project_id}
        />
        <Input
          label={t('forms.field.name')}
          placeholder={t('forms.placeholder.featureGraphName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          autoFocus
        />
        <Textarea
          label={t('forms.field.description')}
          placeholder={t('forms.placeholder.featureGraphDescription')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />

        <div className="border-t border-white/[0.06] pt-4">
          <h4 className="text-sm font-medium text-gray-300 mb-1">{t('forms.autoBuild.title')}</h4>
          <p className="text-xs text-gray-500 mb-3">{t('forms.autoBuild.intro')}</p>

          <Input
            label={t('forms.autoBuild.entryFunction')}
            placeholder={t('forms.autoBuild.entryPlaceholder')}
            value={entryFunction}
            onChange={(e) => setEntryFunction(e.target.value)}
            error={errors.entry_function}
          />
          <p className="mt-1 text-xs text-gray-500">{t('forms.autoBuild.entryHelp')}</p>

          <div className="mt-3">
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {t('forms.autoBuild.depth')} <span className="text-gray-500 font-normal">({depth})</span>
            </label>
            <input
              type="range"
              min={1}
              max={5}
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-0.5">
              <span>{t('forms.autoBuild.depthFocused')}</span>
              <span>{t('forms.autoBuild.depthBroad')}</span>
            </div>
            <p className="mt-1 text-xs text-gray-500" data-testid="depth-hint">
              {depth <= 2
                ? t('forms.autoBuild.depthHintLow')
                : depth === 3
                  ? t('forms.autoBuild.depthHintMid')
                  : t('forms.autoBuild.depthHintHigh')}
            </p>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">{t('forms.autoBuild.relations')}</label>
            <div className="flex flex-wrap gap-2">
              {RELATION_OPTIONS.map((rel) => (
                <button
                  key={rel.key}
                  type="button"
                  onClick={() => toggleRelation(rel.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    relations[rel.key]
                      ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40'
                      : 'bg-white/[0.04] text-gray-500 hover:bg-white/[0.08]'
                  }`}
                >
                  {t(rel.label)}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2.5 mt-4 cursor-pointer group">
            <div className="relative">
              <input
                type="checkbox"
                checked={filterCommunity}
                onChange={(e) => setFilterCommunity(e.target.checked)}
                className="peer sr-only"
              />
              <div className="w-8 h-5 bg-white/[0.08] rounded-full peer-checked:bg-indigo-500/60 transition-colors" />
              <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-gray-300 rounded-full peer-checked:translate-x-3 peer-checked:bg-white transition-transform" />
            </div>
            <div>
              <span className="text-sm text-gray-300 group-hover:text-gray-200 transition-colors">
                {t('forms.autoBuild.community')}
              </span>
              <p className="text-xs text-gray-500">{t('forms.autoBuild.communityHelp')}</p>
            </div>
          </label>
        </div>
      </div>
    ),
    submit: async () => {
      if (!validate()) return false
      const selectedRelations = Object.entries(relations)
        .filter(([, on]) => on)
        .map(([key]) => key)
      await onSubmit({
        project_id: projectId,
        name: name.trim(),
        description: description.trim() || undefined,
        entry_function: entryFunction.trim(),
        depth,
        include_relations: selectedRelations.length > 0 ? selectedRelations : undefined,
        filter_community: filterCommunity,
      })
    },
  }
}
